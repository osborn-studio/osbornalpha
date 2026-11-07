OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3ab-8de2-7f62-a6fe-78857113ea18
--------
user
commit 2af023c
2026-11-07T01:42:09.023776Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 2af023c; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3673ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-UWYDhhUv' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xKQNJsRD' (errno=Operation not permitted)
 M docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md
 M docs/superpowers/specs/2026-11-04-data-foundation-design.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jGnziTvx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wDubvkXy' (errno=Operation not permitted)
2af023cc fix(admin/dq): quarantine action sets per reason, restore_note from detail, shared amend draft, a11y and i18n guards
 messages/en/admin.json                   |  8 +--
 messages/zh/admin.json                   |  8 +--
 src/app/(app)/admin/dq/AdminDqClient.tsx | 86 +++++++++++++++-----------------
 src/app/(app)/admin/dq/panels.tsx        | 82 +++++++++++++++++++-----------
 src/app/(app)/admin/dq/primitives.tsx    |  2 +-
 src/lib/dq/dashboard-view.test.ts        | 32 +++++++++++-
 src/lib/dq/dashboard-view.ts             | 24 +++++++++
 7 files changed, 161 insertions(+), 81 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo "$p"; cat "$p"; fi; done; ls -a | head -30; git show 2af023c --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-Ud6p0iYU' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-TZAPv57U' (errno=Operation not permitted)
commit 2af023cc188b75e8510b669e2b9e19f0ba335119
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:41:50 2026 -0800

    fix(admin/dq): quarantine action sets per reason, restore_note from detail, shared amend draft, a11y and i18n guards
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/messages/en/admin.json b/messages/en/admin.json
index cd10fadf..f808ac39 100644
--- a/messages/en/admin.json
+++ b/messages/en/admin.json
@@ -267,7 +267,7 @@
       "chooseCandidate": "Choose a candidate value",
       "keepRow": "Choose the row to keep",
       "adopt": "Accept and adopt candidate {n}",
-      "keep": "Keep this row",
+      "keep": "Accept with selected keep row",
       "noRowsPromoted": "The item was closed, but no fact was restored (still referenced by another disputed item).",
       "restore": {
         "action": "Restore",
@@ -276,7 +276,8 @@
         "no_result": "No reconciliation result yet; re-run it first.",
         "inputs_changed": "Inputs changed after the latest passing reconciliation; re-run it first.",
         "unchecked": "Not checked (over the per-load check limit; narrow the filter and reload)"
-      }
+      },
+      "acknowledge": "Acknowledge only (no candidate adopted)"
     },
     "conflicts": {
       "already_resolved": "This item was already handled; the list has been refreshed.",
@@ -300,7 +301,8 @@
       "lineage_changed": "The lineage changed; refresh and try again.",
       "scope_missing": "A lineage member has no sync scope row; contact an administrator.",
       "unresolved": "More than one current value would remain; rolled back.",
-      "run_pending": "The related sync run has not finished; try again later."
+      "run_pending": "The related sync run has not finished; try again later.",
+      "issuer_not_active": "The issuer is not currently active; the claim stays pending."
     }
   }
 }
diff --git a/messages/zh/admin.json b/messages/zh/admin.json
index c0a4154f..247047b0 100644
--- a/messages/zh/admin.json
+++ b/messages/zh/admin.json
@@ -267,7 +267,7 @@
       "chooseCandidate": "选择候选值",
       "keepRow": "选择保留的行",
       "adopt": "接受并采用候选 {n}",
-      "keep": "保留此行",
+      "keep": "接受并保留所选行",
       "noRowsPromoted": "已关闭该项，但没有事实被恢复（仍被其他争议项引用）。",
       "restore": {
         "action": "恢复",
@@ -276,7 +276,8 @@
         "no_result": "尚无对账结果，需先重跑对账。",
         "inputs_changed": "最近一次对账通过后输入已变化，需先重跑对账。",
         "unchecked": "未核对（超出单次核对上限，筛选后重试）"
-      }
+      },
+      "acknowledge": "仅确认知晓（不采用候选）"
     },
     "conflicts": {
       "already_resolved": "该项已被处理，列表已刷新。",
@@ -300,7 +301,8 @@
       "lineage_changed": "谱系已变化，请刷新后重试。",
       "scope_missing": "谱系成员缺少同步范围行，请联系管理员。",
       "unresolved": "裁决后仍不止一个当前值，已回滚。",
-      "run_pending": "相关同步运行尚未结束，请稍后重试。"
+      "run_pending": "相关同步运行尚未结束，请稍后重试。",
+      "issuer_not_active": "发行人当前不是活跃状态，声明保持待审核。"
     }
   }
 }
diff --git a/src/app/(app)/admin/dq/AdminDqClient.tsx b/src/app/(app)/admin/dq/AdminDqClient.tsx
index 11ce1438..c956fd92 100644
--- a/src/app/(app)/admin/dq/AdminDqClient.tsx
+++ b/src/app/(app)/admin/dq/AdminDqClient.tsx
@@ -5,7 +5,7 @@ import { useLocale, useTranslations } from 'next-intl';
 import { Panel } from '@/components/ui';
 import type { DqSummary } from '@/lib/dq/dashboard';
 import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
-import { quarantineAcceptBody, quarantineControl, sumByMarket } from '@/lib/dq/dashboard-view';
+import { conflictCode, quarantineActions, quarantineControl, successNoticeCode, sumByMarket } from '@/lib/dq/dashboard-view';
 import { CalendarPanel, ClaimsPanel, ReconciliationPairs } from './panels';
 import type { MarketFilter } from './panels';
 import { DANGER_BG, Detail, Pill, Table, Tile, btn, count, num, pct, s, td } from './primitives';
@@ -70,14 +70,12 @@ export function AdminDqClient() {
     try {
       const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
       if (r.ok) {
-        const j = (await r.json().catch(() => ({}))) as { restore?: { restore_note?: string } };
-        if (j.restore?.restore_note === 'no_rows_promoted') setNotice(t('quarantine.noRowsPromoted'));
+        if (successNoticeCode(await r.json().catch(() => ({})))) setNotice(t('quarantine.noRowsPromoted'));
         reload();
       } else if (r.status === 409) {
         // The claims route answers 409 {error:<code>}; the quarantine route keeps {id, outcome} and may add
         // detail.restore_note or a top-level restore_note (plan 3 接口对齐记录 #9). All three are read.
-        const j = (await r.json().catch(() => ({}))) as { error?: string; outcome?: string; restore_note?: string; detail?: { restore_note?: string } };
-        const code = j.detail?.restore_note ?? j.restore_note ?? j.error ?? j.outcome;
+        const code = conflictCode(await r.json().catch(() => ({})));
         setNotice(code && t.has(`conflicts.${code}`) ? t(`conflicts.${code}`) : t('alreadyResolved'));
         reload();
       } else if (r.status === 404) { setError(t('notFound')); reload(); }
@@ -198,7 +196,7 @@ export function AdminDqClient() {
                   <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                   <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                   <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
-                  <td className="px-2 py-1.5 align-top">{inline ? plainActions(r) : actions(r, 'table')}</td>
+                  <td className="px-2 py-1.5 align-top">{actions(r, 'table')}</td>
                 </tr>
               );
               // Canvas: candidate / keep-row choices sit in a sub-row under the item (Quarantine artboard).
@@ -228,60 +226,58 @@ export function AdminDqClient() {
     </div>
   );
 
-  /** Accept / reject without a selection. For a restore row the accept button is the restore control (server-computed enablement). */
-  function plainActions(row: Row) {
+  /** Radios only; the buttons (adopt / keep / acknowledge / accept / restore / reject) come from quarantineActions. */
+  function choiceBlock(row: Row, surface: 'table' | 'card') {
     const id = String(row.id);
-    const key = s(row.natural_key);
     const control = quarantineControl(row);
-    const restore = control.kind === 'restore';
+    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
+    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
     return (
-      <div className="flex gap-2">
-        <button type="button" disabled={busy || (restore && !control.enabled)} aria-label={`${t('accept')} ${key}`}
-          title={restore && !control.enabled ? t(`quarantine.restore.${control.reason}`) : undefined}
-          onClick={() => resolve(id, { status: 'resolved_accept' })} className={`${btn} text-accent`}>{restore ? t('quarantine.restore.action') : t('accept')}</button>
-        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, { status: 'resolved_reject' })} className={`${btn} text-danger`}>{t('reject')}</button>
-      </div>
+      <fieldset className="space-y-1 text-xs">
+        <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
+        {options.map((o) => (
+          <label key={String(o.value)} className="flex items-center gap-2 font-mono">
+            <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
+            <span className="break-all">{o.label}</span>
+          </label>
+        ))}
+      </fieldset>
     );
   }
 
-  function choiceBlock(row: Row, surface: 'table' | 'card') {
+  function buttons(row: Row) {
     const id = String(row.id);
+    const key = s(row.natural_key);
     const control = quarantineControl(row);
-    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
-    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
-    const body = quarantineAcceptBody(control, choice[id] ?? null);
+    const sel = choice[id] ?? null;
     return (
-      <div className="space-y-2">
-        <fieldset className="space-y-1 text-xs">
-          <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
-          {options.map((o) => (
-            <label key={String(o.value)} className="flex items-center gap-2 font-mono">
-              <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
-              <span className="break-all">{o.label}</span>
-            </label>
-          ))}
-        </fieldset>
-        <button type="button" disabled={busy || body === null} onClick={() => body && resolve(id, body)} className={`${btn} text-accent`}>
-          {control.kind === 'candidates' ? t('quarantine.adopt', { n: typeof choice[id] === 'number' ? Number(choice[id]) : '—' }) : t('quarantine.keep')}
-        </button>
+      <div className="flex flex-wrap gap-2">
+        {quarantineActions(control, sel).map((a) => {
+          const label = a.id === 'adopt' ? t('quarantine.adopt', { n: typeof sel === 'number' ? sel : '—' })
+            : a.id === 'keep' ? t('quarantine.keep')
+            : a.id === 'acknowledge' ? t('quarantine.acknowledge')
+            : a.id === 'restore' ? t('quarantine.restore.action')
+            : a.id === 'reject' ? t('reject') : t('accept');
+          return (
+            <button key={a.id} type="button" disabled={busy || a.body === null} aria-label={`${label} ${key}`}
+              title={a.id === 'restore' && a.body === null && a.reason ? t(`quarantine.restore.${a.reason}`) : undefined}
+              onClick={() => a.body && resolve(id, a.body as { status: Resolution })}
+              className={`${btn} ${a.id === 'reject' ? 'text-danger' : 'text-accent'}`}>{label}</button>
+          );
+        })}
       </div>
     );
   }
 
   function actions(row: Row, surface: 'table' | 'card') {
     const control = quarantineControl(row);
-    if (control.kind === 'candidates' || control.kind === 'lineage') {
-      return <div className="space-y-2">{choiceBlock(row, surface)}{plainActions(row)}</div>;
-    }
-    if (control.kind === 'restore') {
-      return (
-        <div className="space-y-1">
-          {plainActions(row)}
-          <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div>
-        </div>
-      );
-    }
-    return plainActions(row);
+    return (
+      <div className="space-y-2">
+        {surface === 'card' ? choiceBlock(row, 'card') : null}
+        {buttons(row)}
+        {control.kind === 'restore' ? <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div> : null}
+      </div>
+    );
   }
 
   function quarantineCard(row: Row) {
diff --git a/src/app/(app)/admin/dq/panels.tsx b/src/app/(app)/admin/dq/panels.tsx
index 4de711ad..6cd4a2ea 100644
--- a/src/app/(app)/admin/dq/panels.tsx
+++ b/src/app/(app)/admin/dq/panels.tsx
@@ -4,7 +4,7 @@
 // brief): filing calendar, identifier claims (evidence_only amendment form), reconciliation counts
 // by pair. Pure rules live in src/lib/dq/dashboard-view.ts; tokens and components are the existing ones.
 
-import { useState } from 'react';
+import { useRef, useState } from 'react';
 import { Panel } from '@/components/ui';
 import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
 import { AMEND_METHODS, amendBody, claimMode, disclosureTone, overdueDays, suggestedOp, sumByMarket } from '@/lib/dq/dashboard-view';
@@ -14,6 +14,7 @@ import type { Row, T } from './primitives';
 
 export type MarketFilter = '' | 'US' | 'CN';
 const display = (r: Row) => (r.detail as { display?: { ticker?: unknown; name?: unknown } } | null)?.display ?? {};
+const deadlineLabel = (t: T, state: unknown) => (t.has(`calendar.deadline.${s(state)}`) ? t(`calendar.deadline.${s(state)}`) : s(state));
 const rowKey = (r: Row) => `${s(r.issuer_id)}|${s(r.market)}|${s(r.report_kind)}|${s(r.period_end)}`;
 
 export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: { t: T; calendar: CalendarBlock | undefined; market: MarketFilter; onMarket: (m: MarketFilter) => void; today: string; busy: boolean }) {
@@ -49,7 +50,7 @@ export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: {
               <div className="flex items-center justify-between gap-2"><span><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></span><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></div>
               <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.reportKind')}</span><span className="font-mono">{s(r.market)} · {s(r.report_kind)}</span></div>
               <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.periodEnd')}</span><span className="font-mono">{period(r)}</span></div>
-              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.deadlineState')}</span><span>{t(`calendar.deadline.${s(r.deadline_state)}`)} · <span className="font-mono text-text-dim">{s(r.due_rule)}</span></span></div>
+              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.deadlineState')}</span><span>{deadlineLabel(t, r.deadline_state)} · <span className="font-mono text-text-dim">{s(r.due_rule)}</span></span></div>
               <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.dueDate')}</span><span className="font-mono">{s(r.due_date)}</span></div>
               {r.expected_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.expectedDate')}</span><span className="font-mono">{s(r.expected_date)}</span></div> : null}
               {r.upstream_filed_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.upstreamFiled')}</span><span className="font-mono">{s(r.upstream_filed_date)}</span></div> : null}
@@ -69,7 +70,7 @@ export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: {
                 <td className={td}><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></td>
                 <td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
                 <td className={`${td} font-mono`}>{period(r)}</td>
-                <td className={td}>{t(`calendar.deadline.${s(r.deadline_state)}`)}</td>
+                <td className={td}>{deadlineLabel(t, r.deadline_state)}</td>
                 <td className={`${td} font-mono`}>{s(r.due_date)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
                 <td className={`${td} font-mono`}>{s(r.expected_date)}</td><td className={`${td} font-mono`}>{s(r.upstream_filed_date)}</td>
                 <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
@@ -98,18 +99,51 @@ export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: {
   );
 }
 
+interface Draft { id: string; op: AmendForm['op']; security: string; date: string; method: string }
+const securityKey = (x: Row | undefined) => (x ? `${s(x.ticker)}|${s(x.valid_from)}` : '');
+
 export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t: T; claims: ClaimsBlock | undefined; busy: boolean; pending: string | null; time: (v: unknown) => string; onResolve: (id: string, body: Record<string, unknown>) => void }) {
-  const [amending, setAmending] = useState<string | null>(null);
+  // One draft shared by the mobile card and the desktop row, so resizing never loses input.
+  const [draft, setDraft] = useState<Draft | null>(null);
+  const [amendError, setAmendError] = useState<string | null>(null);
+  const toggles = useRef<Record<string, HTMLButtonElement | null>>({});
   const rows = claims?.rows ?? [];
   const title = claims && claims.total > rows.length ? `${t('sections.claims')} · ${t('claims.latest', { shown: rows.length, total: claims.total })}` : t('sections.claims');
-  const controls = (r: Row) => {
+  const securitiesOf = (r: Row) => claims?.securitiesByIssuer[String(r.issuer_id)] ?? [];
+  const focusToggle = (id: string) => {
+    // Return focus to the visible toggle of the row (the other surface is display:none).
+    setTimeout(() => { for (const k of [`card-${id}`, `table-${id}`]) { const el = toggles.current[k]; if (el && el.offsetParent !== null) { el.focus(); return; } } }, 0);
+  };
+  const close = (id: string) => { setDraft(null); setAmendError(null); focusToggle(id); };
+  const open = (r: Row) => {
+    const id = String(r.id);
+    if (draft?.id === id) { close(id); return; }
+    const op = suggestedOp(r.detail);
+    setAmendError(null);
+    setDraft({ id, op, security: securityKey(securitiesOf(r)[0]), date: '', method: AMEND_METHODS[op][0] });
+  };
+  const submit = (r: Row) => {
+    if (!draft) return;
+    const [ticker, validFrom] = draft.security.split('|');
+    const res = amendBody({ op: draft.op, issuerId: String(r.issuer_id), ticker: ticker ?? '', validFrom: validFrom ?? '', date: draft.date, method: draft.method });
+    if (!res.ok) { setAmendError(t(`claims.errors.${res.error}`)); return; }
+    const id = String(r.id);
+    setAmendError(null); setDraft(null); focusToggle(id);
+    onResolve(id, res.body);
+  };
+  const form = (r: Row) => draft && draft.id === String(r.id)
+    ? <AmendFormView t={t} draft={draft} onChange={setDraft} securities={securitiesOf(r)} busy={busy} error={amendError} onSubmit={() => submit(r)} onCancel={() => close(draft.id)} />
+    : null;
+  const controls = (r: Row, surface: 'card' | 'table') => {
     const id = String(r.id);
     const mode = claimMode(r.op);
     if (mode === 'sql_only') return <span className="text-text-muted">{t('claims.sqlOnly')}</span>;
+    const acceptLabel = mode === 'amend' ? t('claims.amendAccept') : t('accept');
     return (
       <div className="flex gap-2">
-        <button type="button" disabled={busy} className={`${btn} text-accent`} aria-label={`${t('accept')} ${id}`}
-          onClick={() => (mode === 'amend' ? setAmending(amending === id ? null : id) : onResolve(id, { status: 'accepted' }))}>{mode === 'amend' ? t('claims.amendAccept') : t('accept')}</button>
+        <button type="button" ref={(el) => { toggles.current[`${surface}-${id}`] = el; }} disabled={busy} className={`${btn} text-accent`} aria-label={`${acceptLabel} ${id}`}
+          aria-expanded={mode === 'amend' ? draft?.id === id : undefined}
+          onClick={() => (mode === 'amend' ? open(r) : onResolve(id, { status: 'accepted' }))}>{acceptLabel}</button>
         <button type="button" disabled={busy} className={`${btn} text-danger`} aria-label={`${t('reject')} ${id}`} onClick={() => onResolve(id, { status: 'rejected' })}>{t('reject')}</button>
       </div>
     );
@@ -126,8 +160,8 @@ export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t:
             <div className="flex justify-between gap-2 font-mono"><span>{s(r.op)} · {s(r.id_type)}</span><span className="text-text-dim">{time(r.created_at)}</span></div>
             <div className="break-all font-mono">{s(r.value)}</div>
             <Detail value={r.detail} className="min-w-0" />
-            <div className="py-1">{controls(r)}</div>
-            {amending === String(r.id) ? <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(String(r.id), body); }} onCancel={() => setAmending(null)} /> : null}
+            <div className="py-1">{controls(r, 'card')}</div>
+            {form(r)}
           </div>
         ))}
         {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('claims.empty')}</div> : null}
@@ -140,14 +174,12 @@ export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t:
               <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
                 {cells(r).map((c, i) => <td key={i} className={`${td} ${i > 0 && i < 5 ? 'font-mono' : ''}`}>{c}</td>)}
                 <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
-                <td className={td}>{controls(r)}</td>
+                <td className={td}>{controls(r, 'table')}</td>
               </tr>
             );
-            if (amending !== id) return [main];
+            if (draft?.id !== id) return [main];
             return [main, (
-              <tr key={`${id}-amend`} className="bg-bg-card"><td colSpan={9} className="px-2 py-2">
-                <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(id, body); }} onCancel={() => setAmending(null)} />
-              </td></tr>
+              <tr key={`${id}-amend`} className="bg-bg-card"><td colSpan={9} className="px-2 py-2">{form(r)}</td></tr>
             )];
           })}
         </Table>
@@ -157,32 +189,26 @@ export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t:
   );
 }
 
-function AmendFormView({ t, row, securities, busy, onSubmit, onCancel }: { t: T; row: Row; securities: Row[]; busy: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void }) {
-  const [op, setOp] = useState<AmendForm['op']>(suggestedOp(row.detail));
-  const [security, setSecurity] = useState(securities[0] ? `${s(securities[0].ticker)}|${s(securities[0].valid_from)}` : '');
-  const [date, setDate] = useState('');
-  const [method, setMethod] = useState<string>(AMEND_METHODS[op][0]);
-  const [error, setError] = useState<string | null>(null);
-  const [ticker, validFrom] = security.split('|');
+function AmendFormView({ t, draft, onChange, securities, busy, error, onSubmit, onCancel }: { t: T; draft: Draft; onChange: (d: Draft) => void; securities: Row[]; busy: boolean; error: string | null; onSubmit: () => void; onCancel: () => void }) {
   const field = 'min-h-9 rounded-md border border-border bg-bg-elevated px-2 font-mono text-text';
+  const { op } = draft;
   return (
-    <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-card p-2 text-xs"
-      onSubmit={(e) => { e.preventDefault(); const r = amendBody({ op, issuerId: String(row.issuer_id), ticker: ticker ?? '', validFrom: validFrom ?? '', date, method }); if (!r.ok) { setError(t(`claims.errors.${r.error}`)); return; } setError(null); onSubmit(r.body); }}>
+    <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-card p-2 text-xs" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
       <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.op')}
-        <select value={op} onChange={(e) => { const next = e.target.value as AmendForm['op']; setOp(next); setMethod(AMEND_METHODS[next][0]); }} className={field}>
+        <select value={op} onChange={(e) => { const next = e.target.value as AmendForm['op']; onChange({ ...draft, op: next, method: AMEND_METHODS[next][0] }); }} className={field}>
           <option value="backdate_window">backdate_window</option><option value="close_security">close_security</option>
         </select>
       </label>
       <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.security')}
-        <select value={security} onChange={(e) => setSecurity(e.target.value)} className={field}>
-          {securities.map((x) => { const v = `${s(x.ticker)}|${s(x.valid_from)}`; return <option key={v} value={v}>{s(x.ticker)} · {s(x.valid_from)} → {s(x.valid_to)}</option>; })}
+        <select value={draft.security} onChange={(e) => onChange({ ...draft, security: e.target.value })} className={field}>
+          {securities.map((x) => <option key={securityKey(x)} value={securityKey(x)}>{s(x.ticker)} · {s(x.valid_from)} → {s(x.valid_to)}</option>)}
         </select>
       </label>
       <label className="flex flex-col gap-1 text-text-dim">{op === 'backdate_window' ? t('claims.amend.newValidFrom') : t('claims.amend.validTo')}
-        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
+        <input type="date" value={draft.date} onChange={(e) => onChange({ ...draft, date: e.target.value })} className={field} />
       </label>
       <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.method')}
-        <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
+        <select value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value })} className={field}>
           {AMEND_METHODS[op].map((m) => <option key={m} value={m}>{m}</option>)}
         </select>
       </label>
diff --git a/src/app/(app)/admin/dq/primitives.tsx b/src/app/(app)/admin/dq/primitives.tsx
index 7dc9aa3d..09c9dd7e 100644
--- a/src/app/(app)/admin/dq/primitives.tsx
+++ b/src/app/(app)/admin/dq/primitives.tsx
@@ -4,7 +4,7 @@ import type { ReactNode } from 'react';
 
 export type Row = Record<string, unknown>;
 export type Col = { label: string; num?: boolean };
-export type T = (key: string, values?: Record<string, string | number>) => string;
+export type T = { (key: string, values?: Record<string, string | number>): string; has: (key: string) => boolean };
 
 export const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
 export const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
diff --git a/src/lib/dq/dashboard-view.test.ts b/src/lib/dq/dashboard-view.test.ts
index eacc03e3..ed5c1a0c 100644
--- a/src/lib/dq/dashboard-view.test.ts
+++ b/src/lib/dq/dashboard-view.test.ts
@@ -1,6 +1,6 @@
 // src/lib/dq/dashboard-view.test.ts
 import {describe,expect,it} from 'vitest';
-import {amendBody,claimMode,disclosureTone,overdueDays,quarantineAcceptBody,quarantineControl,suggestedOp,sumByMarket} from './dashboard-view';
+import {conflictCode,quarantineActions,successNoticeCode,amendBody,claimMode,disclosureTone,overdueDays,quarantineAcceptBody,quarantineControl,suggestedOp,sumByMarket} from './dashboard-view';
 
 describe('calendar view rules',()=>{
  it.each([['overdue','text-danger'],['filed_not_ingested','text-warn'],['unknown_upstream','text-text-muted italic'],['pending','text-text-dim'],['received_late','text-warn'],['received',''],['other','text-text-dim']])('%s → %j',(s,tone)=>{expect(disclosureTone(s)).toBe(tone);});
@@ -62,3 +62,33 @@ describe('quarantine inline controls',()=>{
   expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
  });
 });
+
+describe('quarantine actions and response notices',()=>{
+ const cand=quarantineControl({reason_code:'ambiguous_value',payload:{candidates:[{value:'1'},{value:'2'}]}});
+ const lin=quarantineControl({reason_code:'lineage_conflict',payload:{fact_ids:['f1','f2'],values:[]}});
+ it('ambiguous rows: adopt needs a selection, acknowledge is explicit, no generic accept',()=>{
+  expect(quarantineActions(cand,null)).toEqual([{id:'adopt',body:null},{id:'acknowledge',body:{status:'resolved_accept'}},{id:'reject',body:{status:'resolved_reject'}}]);
+  expect(quarantineActions(cand,1)[0]).toEqual({id:'adopt',body:{status:'resolved_accept',chosen_candidate_index:1}});
+ });
+ it('lineage rows: only keep-selected and reject',()=>{
+  expect(quarantineActions(lin,null).map(a=>a.id)).toEqual(['keep','reject']);
+  expect(quarantineActions(lin,null)[0].body).toBeNull();
+  expect(quarantineActions(lin,'f2')[0].body).toEqual({status:'resolved_accept',keep_fact_id:'f2'});
+ });
+ it('restore and plain rows',()=>{
+  const on=quarantineControl({reason_code:'reconcile_mismatch',restorable:true,detail:{latest_result:{passed:true}}});
+  expect(quarantineActions(on,null)[0]).toEqual({id:'restore',body:{status:'resolved_accept'},reason:'passing'});
+  const off=quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{latest_result:{passed:true}}});
+  expect(quarantineActions(off,null)[0]).toEqual({id:'restore',body:null,reason:'unchecked'});
+  expect(quarantineActions({kind:'plain'},null)).toEqual([{id:'accept',body:{status:'resolved_accept'}},{id:'reject',body:{status:'resolved_reject'}}]);
+ });
+ it('reads the landed route envelope',()=>{
+  expect(successNoticeCode({id:'q',outcome:'resolved',restore:{promoted:0,skipped:['f1']},detail:{restore_note:'no_rows_promoted'}})).toBe('no_rows_promoted');
+  expect(successNoticeCode({restore:{promoted:2,skipped:[]}})).toBeNull();
+  expect(successNoticeCode(null)).toBeNull();
+  expect(conflictCode({id:'q',outcome:'conflict',error:'not_passing',detail:{restore_note:'inputs_unavailable'}})).toBe('inputs_unavailable');
+  expect(conflictCode({error:'value_conflict'})).toBe('value_conflict');
+  expect(conflictCode({id:'q',outcome:'already_resolved'})).toBe('already_resolved');
+  expect(conflictCode({})).toBeNull();
+ });
+});
diff --git a/src/lib/dq/dashboard-view.ts b/src/lib/dq/dashboard-view.ts
index b49ceeb9..e77b2170 100644
--- a/src/lib/dq/dashboard-view.ts
+++ b/src/lib/dq/dashboard-view.ts
@@ -63,3 +63,27 @@ export function quarantineAcceptBody(c:QuarantineControl,choice:number|string|nu
  if(c.kind==='restore'&&!c.enabled)return null;
  return {status:'resolved_accept'};
 }
+
+/** Which buttons a quarantine row shows and the POST body each sends (null body = disabled). Reject is always last. */
+export type QuarantineActionId='adopt'|'keep'|'acknowledge'|'accept'|'restore'|'reject';
+export interface QuarantineAction{id:QuarantineActionId;body:Record<string,unknown>|null;reason?:string}
+export function quarantineActions(c:QuarantineControl,choice:number|string|null):QuarantineAction[]{
+ const reject:QuarantineAction={id:'reject',body:{status:'resolved_reject'}};
+ switch(c.kind){
+  case 'candidates':return [{id:'adopt',body:quarantineAcceptBody(c,choice)},{id:'acknowledge',body:{status:'resolved_accept'}},reject];
+  case 'lineage':return [{id:'keep',body:quarantineAcceptBody(c,choice)},reject];
+  case 'restore':return [{id:'restore',body:quarantineAcceptBody(c,null),reason:c.reason},reject];
+  default:return [{id:'accept',body:{status:'resolved_accept'}},reject];
+ }
+}
+/** Page notice for a successful quarantine POST: the restore note lives in detail.restore_note (top-level tolerated). */
+export function successNoticeCode(body:unknown):'no_rows_promoted'|null{
+ const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown};
+ return (b.detail?.restore_note??b.restore_note)==='no_rows_promoted'?'no_rows_promoted':null;
+}
+/** Code of a 409 body: detail.restore_note, top-level restore_note, error, then outcome. */
+export function conflictCode(body:unknown):string|null{
+ const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown;error?:unknown;outcome?:unknown};
+ for(const v of [b.detail?.restore_note,b.restore_note,b.error,b.outcome])if(typeof v==='string'&&v!=='')return v;
+ return null;
+}

exec
/bin/zsh -lc "cat 'src/app/(app)/admin/dq/AdminDqClient.tsx'; cat src/lib/dq/dashboard-view.ts; cat package.json; find . -name AGENTS.override.md -o -name AGENTS.md -o -name CLAUDE.md | head -60; cat ~/.codex/config.toml | grep -A4 -B2 -E 'fallback|project_doc' " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 132ms:
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Panel } from '@/components/ui';
import type { DqSummary } from '@/lib/dq/dashboard';
import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
import { conflictCode, quarantineActions, quarantineControl, successNoticeCode, sumByMarket } from '@/lib/dq/dashboard-view';
import { CalendarPanel, ClaimsPanel, ReconciliationPairs } from './panels';
import type { MarketFilter } from './panels';
import { DANGER_BG, Detail, Pill, Table, Tile, btn, count, num, pct, s, td } from './primitives';
import type { Row } from './primitives';

interface DqResponse {
  summary: DqSummary;
  batches24hTruncated: boolean;
  batches: Row[];
  freshness: (Row & { status: string; stored_status: string })[];
  quarantine: { rows: Row[]; page: number; pageSize: number; total: number };
  reconciliations: Row[];
  datasets?: string[];
  calendar: CalendarBlock;
  claims: ClaimsBlock;
  reconciliationsByPair: ReconciliationsByPair;
  refreshedAt: string;
}
type Resolution = 'resolved_accept' | 'resolved_reject';

export function AdminDqClient() {
  const t = useTranslations('admin.dq');
  const locale = useLocale();
  const [dataset, setDataset] = useState('');
  const [market, setMarket] = useState<MarketFilter>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DqResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, number | string>>({});
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ page: String(page) });
    if (dataset) qs.set('dataset', dataset);
    if (market) qs.set('market', market);
    setLoading(true);
    fetch(`/api/admin/dq?${qs}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DqResponse>; })
      .then((d) => {
        setData(d); setError(null); setLoading(false);
        // A resolve can empty the last page; step back to the new last page and refetch.
        const lastPage = Math.max(1, Math.ceil(d.quarantine.total / d.quarantine.pageSize));
        if (d.quarantine.rows.length === 0 && d.quarantine.total > 0 && page > lastPage) setPage(lastPage);
      })
      .catch((e) => { if (e instanceof Error && e.name === 'AbortError') return; setError(t('loadFailed')); setLoading(false); });
    return () => controller.abort();
  }, [dataset, market, page, tick, t]);

  const time = (v: unknown) => {
    const d = new Date(String(v ?? ''));
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  /** One POST helper for quarantine and claims; 409 bodies carry a code shown as a notice. */
  async function post(url: string, id: string, body: Record<string, unknown>) {
    setPending(id); setError(null); setNotice(null);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
      if (r.ok) {
        if (successNoticeCode(await r.json().catch(() => ({})))) setNotice(t('quarantine.noRowsPromoted'));
        reload();
      } else if (r.status === 409) {
        // The claims route answers 409 {error:<code>}; the quarantine route keeps {id, outcome} and may add
        // detail.restore_note or a top-level restore_note (plan 3 接口对齐记录 #9). All three are read.
        const code = conflictCode(await r.json().catch(() => ({})));
        setNotice(code && t.has(`conflicts.${code}`) ? t(`conflicts.${code}`) : t('alreadyResolved'));
        reload();
      } else if (r.status === 404) { setError(t('notFound')); reload(); }
      else setError(t('resolveFailed'));
    } catch {
      setError(t('resolveFailed'));
    } finally {
      setPending(null);
    }
  }
  const resolve = (id: string, body: { status: Resolution; chosen_candidate_index?: number; keep_fact_id?: string }) => post(`/api/admin/dq/quarantine/${id}`, id, body);
  const resolveClaim = (id: string, body: Record<string, unknown>) => post(`/api/admin/dq/claims/${id}`, id, body);

  const busy = loading || pending !== null;
  const sm = data?.summary;
  const q = data?.quarantine;
  const cal = data?.calendar;
  const today = (data?.refreshedAt ?? new Date().toISOString()).slice(0, 10);
  const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
  // Registry inventory (Task 2) ∪ what this response loaded ∪ the current selection, so it never disappears.
  const datasets = Array.from(new Set([
    ...(data?.datasets ?? []),
    ...[...(data?.freshness ?? []), ...(data?.batches ?? []), ...(q?.rows ?? [])].map((r) => String(r.dataset)),
    ...(dataset ? [dataset] : []),
  ])).sort();
  const by = sm?.batchesByStatus ?? {};
  const batchTotal = Object.values(by).reduce((a, b) => a + b, 0);
  const recShown = data?.reconciliations.length ?? 0;
  const recTotal = sm?.failedReconciliationsTotal ?? 0;
  const recTitle = recTotal > recShown
    ? `${t('sections.reconciliations')} · ${t('sections.reconciliationsLatest', { shown: recShown, total: recTotal })}`
    : t('sections.reconciliations');
  const overdue = sumByMarket(cal?.overdueByMarket);

  return (
    <div data-density="data" className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="mt-1 text-xs text-text-dim">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {data ? <span className="rounded border border-border bg-bg-card px-2 py-1 font-mono text-[11px] text-text-dim">{t('refreshedAt', { time: new Date(data.refreshedAt).toLocaleTimeString(locale, { hour12: false }) })}</span> : null}
          <button type="button" onClick={reload} disabled={busy} className="min-h-9 rounded-md border border-border bg-bg-elevated px-3 text-xs hover:text-accent disabled:opacity-50">{loading ? t('loading') : t('refresh')}</button>
        </div>
      </header>

      {notice ? <div role="status" className="rounded-md border border-border bg-bg-card px-3 py-2 text-xs text-warn">{notice}</div> : null}
      {error ? <div role="alert" className={`rounded-md ${DANGER_BG} px-3 py-2 text-xs text-danger`}>{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label={t('tiles.notFresh')} value={sm ? `${sm.notFresh.length} / ${sm.freshnessTotal}` : '—'}
          tone={sm && sm.notFresh.length > 0 ? 'text-warn' : undefined}
          note={sm ? t('tiles.notFreshNote', sm.notFreshByStatus) : null} />
        <Tile label={t('tiles.overdue')} value={cal ? overdue : '—'} tone={overdue > 0 ? 'text-danger' : undefined}
          note={cal ? t('tiles.overdueNote', { us: cal.overdueByMarket.US, cn: cal.overdueByMarket.CN, filed: sumByMarket(cal.filedNotIngestedByMarket), unknown: sumByMarket(cal.unknownUpstreamByMarket) }) : null} />
        <Tile label={t('tiles.openQuarantine')} value={sm ? sm.openQuarantineTotal : '—'} note={t('tiles.openQuarantineNote')} />
        <Tile label={t('tiles.failedReconciliations')} value={sm ? sm.failedReconciliationsTotal : '—'}
          tone={sm && sm.failedReconciliationsTotal > 0 ? 'text-danger' : undefined} />
        <Tile label={t('tiles.batches24h')} value={sm ? `${data?.batches24hTruncated ? '≥' : ''}${batchTotal}` : '—'}
          note={sm ? t('tiles.batchesNote', { success: by.success ?? 0, partial: by.partial ?? 0, failed: by.failed ?? 0 }) : null} />
      </div>

      <Panel title={t('sections.freshness')}>
        <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.cadence') }, { label: t('columns.lastOk') }, { label: t('columns.status') }, { label: t('columns.stored') }]}>
          {(data?.freshness ?? []).map((f) => (
            <tr key={String(f.dataset)}>
              <td className={`${td} font-mono`}>{s(f.dataset)}</td><td className={td}>{s(f.expected_cadence)}</td>
              <td className={td}>{time(f.last_ok_at)}</td><td className={td}><Pill value={f.status} /></td>
              <td className={`${td} font-mono ${f.status !== f.stored_status ? 'text-warn' : 'text-text-dim'}`}>{f.status !== f.stored_status ? `≠ ${f.stored_status}` : f.stored_status}</td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.freshness')}</p>
      </Panel>

      <CalendarPanel t={t} calendar={cal} market={market} onMarket={(m) => setMarket(m)} today={today} busy={busy} />

      <Panel title={t('sections.batches')}>
        <Table empty={t('empty')} head={[{ label: t('columns.started') }, { label: t('columns.dataset') }, { label: t('columns.producer') }, { label: t('columns.batchStatus') }, { label: t('columns.inserted'), num: true }, { label: t('columns.quarantined'), num: true }, { label: t('columns.failed'), num: true }]}>
          {(data?.batches ?? []).map((b) => (
            <tr key={String(b.batch_id)}>
              <td className={td}>{time(b.started_at)}</td><td className={`${td} font-mono`}>{s(b.dataset)}</td><td className={td}>{s(b.producer)}</td>
              <td className={td}><Pill value={String(b.status)} /></td>
              <td className={num}>{count(b, 'inserted')}</td><td className={num}>{count(b, 'quarantined')}</td><td className={num}>{count(b, 'failed')}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title={t('sections.quarantine')}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-2 text-text-dim">
            <span>{t('columns.dataset')}</span>
            <select value={dataset} disabled={pending !== null} onChange={(e) => { setDataset(e.target.value); setPage(1); }} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
              <option value="">{t('all')}</option>
              {datasets.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2 text-text-dim">
            <span className="tabular-nums">{t('page', { page: q?.page ?? page, pages, total: q?.total ?? 0 })}</span>
            <button type="button" disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('prev')}</button>
            <button type="button" disabled={busy || page >= pages} onClick={() => setPage((p) => p + 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('next')}</button>
          </div>
        </div>
        <div className="divide-y divide-border rounded-md border border-border sm:hidden">
          {(q?.rows ?? []).map(quarantineCard)}
          {q && q.rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('empty')}</div> : null}
        </div>
        <div className="hidden sm:block">
          <Table empty={t('empty')} head={[{ label: t('columns.time') }, { label: t('columns.dataset') }, { label: t('columns.table') }, { label: t('columns.naturalKey') }, { label: t('columns.reason') }, { label: t('columns.detail') }, { label: t('columns.actions') }]}>
            {(q?.rows ?? []).flatMap((r) => {
              const id = String(r.id);
              const control = quarantineControl(r);
              const inline = control.kind === 'candidates' || control.kind === 'lineage';
              const main = (
                <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
                  <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                  <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                  <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                  <td className="px-2 py-1.5 align-top">{actions(r, 'table')}</td>
                </tr>
              );
              // Canvas: candidate / keep-row choices sit in a sub-row under the item (Quarantine artboard).
              return inline ? [main, <tr key={`${id}-choice`} className="bg-bg-card"><td colSpan={7} className="px-2 py-2">{choiceBlock(r, 'table')}</td></tr>] : [main];
            })}
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
      </Panel>

      <ClaimsPanel t={t} claims={data?.claims} busy={busy} pending={pending} time={time} onResolve={resolveClaim} />

      <Panel title={recTitle}>
        <ReconciliationPairs t={t} byPair={data?.reconciliationsByPair} time={time} />
        <Table empty={t('empty')} head={[{ label: t('columns.pair') }, { label: t('columns.kind') }, { label: t('columns.outcome') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }, { label: t('columns.detail') }]}>
          {(data?.reconciliations ?? []).map((r) => (
            <tr key={String(r.id)}>
              <td className={`${td} font-mono`}>{s(r.pair ?? r.dataset)}</td><td className={td}>{s(r.kind)}</td><td className={td}>{s(r.outcome)}</td>
              <td className={`${td} font-mono`}>{s(r.natural_key)}</td>
              <td className={td}>{s(r.left_source)}</td><td className={num}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={num}>{s(r.right_value)}</td>
              <td className={`${num} ${r.passed === false ? 'text-danger' : ''}`}>{pct(r.rel_diff)}</td><td className={num}>{pct(r.tolerance)}</td>
              <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );

  /** Radios only; the buttons (adopt / keep / acknowledge / accept / restore / reject) come from quarantineActions. */
  function choiceBlock(row: Row, surface: 'table' | 'card') {
    const id = String(row.id);
    const control = quarantineControl(row);
    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
    return (
      <fieldset className="space-y-1 text-xs">
        <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
        {options.map((o) => (
          <label key={String(o.value)} className="flex items-center gap-2 font-mono">
            <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
            <span className="break-all">{o.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }

  function buttons(row: Row) {
    const id = String(row.id);
    const key = s(row.natural_key);
    const control = quarantineControl(row);
    const sel = choice[id] ?? null;
    return (
      <div className="flex flex-wrap gap-2">
        {quarantineActions(control, sel).map((a) => {
          const label = a.id === 'adopt' ? t('quarantine.adopt', { n: typeof sel === 'number' ? sel : '—' })
            : a.id === 'keep' ? t('quarantine.keep')
            : a.id === 'acknowledge' ? t('quarantine.acknowledge')
            : a.id === 'restore' ? t('quarantine.restore.action')
            : a.id === 'reject' ? t('reject') : t('accept');
          return (
            <button key={a.id} type="button" disabled={busy || a.body === null} aria-label={`${label} ${key}`}
              title={a.id === 'restore' && a.body === null && a.reason ? t(`quarantine.restore.${a.reason}`) : undefined}
              onClick={() => a.body && resolve(id, a.body as { status: Resolution })}
              className={`${btn} ${a.id === 'reject' ? 'text-danger' : 'text-accent'}`}>{label}</button>
          );
        })}
      </div>
    );
  }

  function actions(row: Row, surface: 'table' | 'card') {
    const control = quarantineControl(row);
    return (
      <div className="space-y-2">
        {surface === 'card' ? choiceBlock(row, 'card') : null}
        {buttons(row)}
        {control.kind === 'restore' ? <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div> : null}
      </div>
    );
  }

  function quarantineCard(row: Row) {
    return (
      <div key={String(row.id)} className={`space-y-1 p-3 text-xs ${pending === String(row.id) ? 'opacity-50' : ''}`}>
        <div className="flex justify-between gap-2 font-mono"><span>{s(row.dataset)} · {s(row.table_name)}</span><span className="text-text-dim">{time(row.created_at)}</span></div>
        <div className="break-all font-mono">{s(row.natural_key)}</div>
        <div className="text-text-dim">{s(row.reason_code)}</div>
        <Detail value={row.detail} className="min-w-0" />
        <div className="py-1">{actions(row, 'card')}</div>
      </div>
    );
  }
}
// src/lib/dq/dashboard-view.ts
// Pure view rules for the /admin/dq panels (spec §7.2), kept out of the client component so they are
// unit-tested (the repo has no component-test setup: vitest runs src/**/*.test.ts in node). Tones are
// existing tokens only (text-danger / text-warn / text-text-muted / text-text-dim); no new colours.
export type Tone=''|'text-danger'|'text-warn'|'text-text-dim'|'text-text-muted'|'text-text-muted italic';
const DISCLOSURE_TONE:Record<string,Tone>={overdue:'text-danger',filed_not_ingested:'text-warn',unknown_upstream:'text-text-muted italic',pending:'text-text-dim',received_late:'text-warn',received:''};
export const disclosureTone=(state:string):Tone=>DISCLOSURE_TONE[state]??'text-text-dim';
/** Whole days past the due date for an overdue row; null otherwise (never for estimated / no_rule rows). */
export function overdueDays(row:{disclosure_state?:unknown;due_date?:unknown},today:string):number|null{
 if(row.disclosure_state!=='overdue'||typeof row.due_date!=='string')return null;
 const d=Math.round((Date.parse(`${today}T00:00:00Z`)-Date.parse(`${row.due_date}T00:00:00Z`))/86_400_000);
 return Number.isFinite(d)&&d>0?d:null;
}
export const sumByMarket=(b:{US:number;CN:number}|undefined)=>b?b.US+b.CN:0;

/** Claims panel: what the accept control does for a row. */
export type ClaimMode='accept'|'amend'|'sql_only';
export const claimMode=(op:unknown):ClaimMode=>op==='legacy'?'sql_only':op==='evidence_only'?'amend':'accept';

export interface AmendForm{op:'backdate_window'|'close_security';issuerId:string;ticker:string;validFrom:string;date:string;method:string}
export const AMEND_METHODS={backdate_window:['listing_date','ticker_change','curated'],close_security:['delisting','ticker_change','curated']} as const;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/** POST /api/admin/dq/claims/[id] body for an evidence_only acceptance (spec §4.2.1 target/params per op), or an error key. */
export function amendBody(f:AmendForm):{ok:true;body:{status:'accepted';amend:{op:AmendForm['op'];target:{issuer_id:string;ticker:string;valid_from:string};params:Record<string,string>}}}|{ok:false;error:'amend_security'|'amend_date'|'amend_method'}{
 if(!f.ticker||!ISO.test(f.validFrom))return {ok:false,error:'amend_security'};
 if(!ISO.test(f.date))return {ok:false,error:'amend_date'};
 if(!(AMEND_METHODS[f.op] as readonly string[]).includes(f.method))return {ok:false,error:'amend_method'};
 const params:Record<string,string>=f.op==='backdate_window'?{new_valid_from:f.date,valid_from_method:f.method}:{valid_to:f.date,valid_to_method:f.method};
 return {ok:true,body:{status:'accepted',amend:{op:f.op,target:{issuer_id:f.issuerId,ticker:f.ticker,valid_from:f.validFrom},params}}};
}
/** The suggested op stored by the producer (params.suggested_op), defaulting to backdate_window. */
export const suggestedOp=(detail:unknown):AmendForm['op']=>{
 const op=(detail as {params?:{suggested_op?:unknown}}|null)?.params?.suggested_op;
 return op==='close_security'?'close_security':'backdate_window';
};

/** Quarantine inline interactions (spec §7.2): which control a row shows. */
export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'|'unchecked'}|{kind:'plain'};
const str=(v:unknown)=>v===null||v===undefined?'—':String(v);
export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown;restorable_checked?:unknown}):QuarantineControl{
 const payload=(row.payload??{}) as Record<string,unknown>;
 if(row.reason_code==='ambiguous_value'&&Array.isArray(payload.candidates))
  return {kind:'candidates',options:(payload.candidates as Record<string,unknown>[]).map((c,index)=>({index,label:`${str(c.value)} ${str(c.unit)} · ${str(c.sourceConcept)} · ${str(c.filingRef)}`}))};
 if(row.reason_code==='lineage_conflict'&&Array.isArray(payload.fact_ids)){
  const values=Array.isArray(payload.values)?payload.values as Record<string,unknown>[]:[];
  return {kind:'lineage',options:(payload.fact_ids as unknown[]).map((id,i)=>{const v=values.find(x=>x.fact_id===id)??values[i]??{};return {factId:String(id),label:`${str(v.value)} · ${str(v.issuer_id)} · ${str(v.filing)}`};})};
 }
 if(row.reason_code==='reconcile_mismatch'){
  const latest=((row.detail??{}) as {latest_result?:{passed?:unknown}}).latest_result;
  if(!latest)return {kind:'restore',enabled:false,reason:'no_result'};
  if(latest.passed!==true)return {kind:'restore',enabled:false,reason:'not_passing'};
  // restorable_checked:false = over the per-load live-check cap (or no hash wiring): the row was NOT checked, so never claim its inputs changed
  if(row.restorable_checked===false&&row.restorable!==true)return {kind:'restore',enabled:false,reason:'unchecked'};
  // server-computed (loadDqDashboard): passed AND latest inputs_hash === inputsHashNow(row)
  return row.restorable===true?{kind:'restore',enabled:true,reason:'passing'}:{kind:'restore',enabled:false,reason:'inputs_changed'};
 }
 return {kind:'plain'};
}
/** POST /api/admin/dq/quarantine/[id] body for an accept with a selection (spec §4.4, §4.6). */
export function quarantineAcceptBody(c:QuarantineControl,choice:number|string|null):{status:'resolved_accept';chosen_candidate_index?:number;keep_fact_id?:string}|null{
 if(c.kind==='candidates'){if(typeof choice!=='number'||!c.options.some(o=>o.index===choice))return null;return {status:'resolved_accept',chosen_candidate_index:choice};}
 if(c.kind==='lineage'){if(typeof choice!=='string'||!c.options.some(o=>o.factId===choice))return null;return {status:'resolved_accept',keep_fact_id:choice};}
 if(c.kind==='restore'&&!c.enabled)return null;
 return {status:'resolved_accept'};
}

/** Which buttons a quarantine row shows and the POST body each sends (null body = disabled). Reject is always last. */
export type QuarantineActionId='adopt'|'keep'|'acknowledge'|'accept'|'restore'|'reject';
export interface QuarantineAction{id:QuarantineActionId;body:Record<string,unknown>|null;reason?:string}
export function quarantineActions(c:QuarantineControl,choice:number|string|null):QuarantineAction[]{
 const reject:QuarantineAction={id:'reject',body:{status:'resolved_reject'}};
 switch(c.kind){
  case 'candidates':return [{id:'adopt',body:quarantineAcceptBody(c,choice)},{id:'acknowledge',body:{status:'resolved_accept'}},reject];
  case 'lineage':return [{id:'keep',body:quarantineAcceptBody(c,choice)},reject];
  case 'restore':return [{id:'restore',body:quarantineAcceptBody(c,null),reason:c.reason},reject];
  default:return [{id:'accept',body:{status:'resolved_accept'}},reject];
 }
}
/** Page notice for a successful quarantine POST: the restore note lives in detail.restore_note (top-level tolerated). */
export function successNoticeCode(body:unknown):'no_rows_promoted'|null{
 const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown};
 return (b.detail?.restore_note??b.restore_note)==='no_rows_promoted'?'no_rows_promoted':null;
}
/** Code of a 409 body: detail.restore_note, top-level restore_note, error, then outcome. */
export function conflictCode(body:unknown):string|null{
 const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown;error?:unknown;outcome?:unknown};
 for(const v of [b.detail?.restore_note,b.restore_note,b.error,b.outcome])if(typeof v==='string'&&v!=='')return v;
 return null;
}
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

exec
/bin/zsh -lc "cat 'src/app/api/admin/dq/quarantine/[id]/route.ts'; sed -n '210,230p' 'src/app/(app)/admin/dq/panels.tsx'; rg 'restore_note' src/lib/dq; ./node_modules/.bin/tsc --noEmit --incremental false" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
exec
/bin/zsh -lc 'for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for n in AGENTS.md AGENTS.override.md; do if [ -f "$d/$n" ]; then cat "$d/$n"; fi; done; done; git rev-parse HEAD; cat vitest.config.*' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7pzLsILi' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fieumkIN' (errno=Operation not permitted)
2af023cc188b75e8510b669e2b9e19f0ba335119
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

 succeeded in 27776ms:
import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { markAudited, resolveFactsItem, type FactsResolveOutcome } from '@/lib/dq/facts-resolver';
import { resolveQuarantine, type QuarantineStatus, type ResolveOutcome } from '@/lib/dq/quarantine';
import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
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
// plan 3 (§4.6): rule_failed / invalid_choice 400; conflict (generation_moved, conflict_exists, duplicate, replay_required, filing_not_found, not_passing, lineage_changed, scope_missing, unresolved, stale_evaluation, target_not_active, use_dedicated_resolver, read_truncated) 409; batch_mismatch is a 500; refusal bodies are {id, outcome, error:<code>, detail?:{restore_note}} (plan 3 接口对齐记录 #9).
const HTTP_STATUS: Record<Outcome, number> = { resolved: 200, hook_retried: 200, not_found: 404, already_resolved: 409, run_pending: 409, invalid_choice: 400, rule_failed: 400, conflict: 409 };
const MAX_CANDIDATE_INDEX = 999;
const AUDITED: readonly Outcome[] = ['resolved', 'hook_retried'];

// The SQL function resolve_facts_quarantine is the final authority; its non-coded errors arrive as
// FactsDbError('unknown', '<message>').
// Codes of the plan-3 SQL verdict functions that reach the route without passing through the resolver's own refusal mapping
// (the resolver maps them itself; this is defence in depth). batch_mismatch is deliberately absent: a programming error (spec §4.6/§8) that stays a 500.
const SQL_CONFLICT_CODES: readonly string[] = ['use_dedicated_resolver', 'target_not_active', 'lineage_changed', 'scope_missing', 'conflict_exists', 'replay_required', 'filing_not_found', 'generation_moved', 'duplicate', 'stale_evaluation', 'not_passing', 'unresolved', 'read_truncated'];
const SQL_CHOICE_CODES: readonly string[] = ['invalid_choice', 'invalid_candidate'];
function factsOutcome(e: unknown): { outcome: Outcome; code?: string } | null {
  if (!(e instanceof FactsDbError)) return null;
  if (e.code === 'run_pending') return { outcome: 'run_pending' };
  if (e.code === 'invalid_chosen') return { outcome: 'invalid_choice' };
  if (e.code === 'item_not_open') return { outcome: 'already_resolved' };
  if (SQL_CHOICE_CODES.includes(e.code)) return { outcome: 'invalid_choice', code: e.code };
  if (SQL_CONFLICT_CODES.includes(e.code)) return { outcome: 'conflict', code: e.code };
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

    const index = (body as { chosen_candidate_index?: unknown } | null)?.chosen_candidate_index;
    if (index !== undefined && (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MAX_CANDIDATE_INDEX)) {
      return NextResponse.json({ error: 'invalid_chosen_candidate_index' }, { status: 400 });
    }
    const keep = (body as { keep_fact_id?: unknown } | null)?.keep_fact_id;
    if (keep !== undefined && (typeof keep !== 'string' || !UUID_RE.test(keep))) {
      return NextResponse.json({ error: 'invalid_keep_fact_id' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    const [item] = await client.select('dq_quarantine', { id }, { limit: 1 });
    if (!item) return NextResponse.json({ id, outcome: 'not_found' }, { status: 404 });

    // chosen_fact_ids is a verdict on a same_day_conflict accept and nothing else
    if (chosen !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'same_day_conflict')) {
      return NextResponse.json({ error: 'chosen_fact_ids_not_applicable' }, { status: 400 });
    }
    // chosen_candidate_index adopts a candidate of an ambiguous_value item; keep_fact_id settles a lineage_conflict (plan 3 §4.4, §4.6)
    if (index !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'ambiguous_value')) {
      return NextResponse.json({ error: 'chosen_candidate_index_not_applicable' }, { status: 400 });
    }
    if (keep !== undefined && (status !== 'resolved_accept' || item.reason_code !== 'lineage_conflict')) {
      return NextResponse.json({ error: 'keep_fact_id_not_applicable' }, { status: 400 });
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
          status: status as Resolution, chosenFactIds: chosen as string[] | undefined,
          chosenCandidateIndex: index as number | undefined, keepFactId: keep as string | undefined, resolvedBy: user.id,
          inputsHashNow: restoreInputsHashNow(admin),
        });
        outcome = r.outcome;
        auditAs = r.auditAs;
        recovered = r.recovered;
        hookFailed = r.hook?.state === 'failed';
        extra = {
          hook: r.hook ?? null, promoted: r.promoted ?? null, skipped: r.skipped ?? null, chosen_fact_ids: r.chosenFactIds ?? null,
          ...(r.adoptedFactId !== undefined ? { adopted_fact_id: r.adoptedFactId } : {}),
          // the PERSISTED choices (a retry's body may differ from what was committed)
          ...(r.chosenCandidateIndex !== undefined ? { chosen_candidate_index: r.chosenCandidateIndex } : {}),
          ...(r.keepFactId !== undefined ? { keep_fact_id: r.keepFactId } : {}),
          ...(r.restore !== undefined ? { restore: r.restore } : {}),
          // restore_note lives in ONE place, detail.restore_note, on success (no_rows_promoted) and on refusal alike (spec §4.6/§8)
          ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}),
          ...(r.quarantined !== undefined ? { quarantined: r.quarantined } : {}),
        };
        // refusals carry only {error:<code>, detail?} (no hook/promoted/... nulls); same body shape as the claims route (接口对齐记录 #9)
        if (r.outcome === 'rule_failed' || r.outcome === 'invalid_choice' || r.outcome === 'conflict') extra = r.code !== undefined ? { error: r.code, ...(r.restoreNote !== undefined ? { detail: { restore_note: r.restoreNote } } : {}) } : {};
      } catch (e) {
        const mapped = factsOutcome(e);
        if (mapped === null) throw e;
        outcome = mapped.outcome;
        if (mapped.code !== undefined) extra = { error: mapped.code };
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
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.method')}
        <select value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value })} className={field}>
          {AMEND_METHODS[op].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>
      <button type="submit" disabled={busy || securities.length === 0} className={`${btn} text-accent`}>{t('claims.amend.submit')}</button>
      <button type="button" onClick={onCancel} className={btn}>{t('claims.amend.cancel')}</button>
      {securities.length === 0 ? <span className="text-text-muted">{t('claims.amend.noSecurities')}</span> : null}
      {error ? <span role="alert" className="text-danger">{error}</span> : null}
    </form>
  );
}

/** Per-pair failure counts as neutral bars (length = failed / max; never up/down colours) plus the pair's latest cycle. */
export function ReconciliationPairs({ t, byPair, time }: { t: T; byPair: ReconciliationsByPair | undefined; time: (v: unknown) => string }) {
  const entries = Object.entries(byPair ?? {});
  const max = Math.max(1, ...entries.map(([, v]) => v.failed));
  return (
    <div className="mb-3 space-y-1.5 text-xs">
      {entries.map(([pair, v]) => (
        <div key={pair} className="flex flex-wrap items-center gap-x-3 gap-y-1">
src/lib/dq/dashboard-view.ts:/** Page notice for a successful quarantine POST: the restore note lives in detail.restore_note (top-level tolerated). */
src/lib/dq/dashboard-view.ts: const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown};
src/lib/dq/dashboard-view.ts: return (b.detail?.restore_note??b.restore_note)==='no_rows_promoted'?'no_rows_promoted':null;
src/lib/dq/dashboard-view.ts:/** Code of a 409 body: detail.restore_note, top-level restore_note, error, then outcome. */
src/lib/dq/dashboard-view.ts: const b=(body??{}) as {detail?:{restore_note?:unknown};restore_note?:unknown;error?:unknown;outcome?:unknown};
src/lib/dq/dashboard-view.ts: for(const v of [b.detail?.restore_note,b.restore_note,b.error,b.outcome])if(typeof v==='string'&&v!=='')return v;
src/lib/dq/facts-resolver.test.ts: it('reconcile_mismatch: without inputsHashNow → 409 not_passing + reconcile_wiring_missing (no write); {unavailable} → that note (inputs_unavailable / current_evidence_unavailable); with a hash → restoreReconciled(item, batch, hash) and materialize of the persisted target; promoted 0 → restore_note; not_passing → conflict',async()=>{
src/lib/dq/facts-resolver.ts://   the persisted target; promoted 0 → restoreNote 'no_rows_promoted' (the route's detail.restore_note, success and refusal alike) with the skipped reasons in restore.
src/lib/dq/facts-resolver.ts: /** why a reconcile_mismatch restore was refused before reaching SQL (route: detail.restore_note) */
src/lib/dq/dashboard-view.test.ts:  expect(successNoticeCode({id:'q',outcome:'resolved',restore:{promoted:0,skipped:['f1']},detail:{restore_note:'no_rows_promoted'}})).toBe('no_rows_promoted');
src/lib/dq/dashboard-view.test.ts:  expect(conflictCode({id:'q',outcome:'conflict',error:'not_passing',detail:{restore_note:'inputs_unavailable'}})).toBe('inputs_unavailable');

codex
No actionable regressions were found in the changed action controls, shared amendment state, or response handling. The response helpers match the API envelopes, and TypeScript checking passed.
No actionable regressions were found in the changed action controls, shared amendment state, or response handling. The response helpers match the API envelopes, and TypeScript checking passed.

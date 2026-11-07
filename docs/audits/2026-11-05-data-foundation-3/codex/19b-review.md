OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3a7-9a0a-79a2-a3e6-7fd51051aed6
--------
user
commit bbf66ae
2026-11-07T01:37:50.149306Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline bbf66ae; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1967ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-uyCV8VlY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-egtaDMSx' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/19b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nSwzz9B3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-j8oy48H9' (errno=Operation not permitted)
bbf66ae9 feat(admin/dq): calendar, claims and reconciliation panels, inline quarantine choices, overdue tile (per Claude Design canvas)
 messages/en/admin.json                   | 122 ++++++++++++++-
 messages/zh/admin.json                   | 122 ++++++++++++++-
 src/app/(app)/admin/dq/AdminDqClient.tsx | 251 +++++++++++++++++--------------
 src/app/(app)/admin/dq/panels.tsx        | 215 ++++++++++++++++++++++++++
 src/app/(app)/admin/dq/primitives.tsx    |  60 ++++++++
 src/lib/dq/dashboard-view.test.ts        |  11 ++
 src/lib/dq/dashboard-view.ts             |   6 +-
 7 files changed, 668 insertions(+), 119 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show bbf66ae -- '"'src/**'; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-9bpaA0ap' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eTnJ9DQs' (errno=Operation not permitted)
commit bbf66ae987652a3a38867eca256c0f8b5e738e29
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:37:35 2026 -0800

    feat(admin/dq): calendar, claims and reconciliation panels, inline quarantine choices, overdue tile (per Claude Design canvas)
    
    quarantineControl: restorable_checked:false rows show a distinct 'unchecked' restore state instead of inputs_changed.
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/app/(app)/admin/dq/AdminDqClient.tsx b/src/app/(app)/admin/dq/AdminDqClient.tsx
index 27fdfdec..11ce1438 100644
--- a/src/app/(app)/admin/dq/AdminDqClient.tsx
+++ b/src/app/(app)/admin/dq/AdminDqClient.tsx
@@ -1,11 +1,16 @@
 'use client';
 
-import { useCallback, useEffect, useState, type ReactNode } from 'react';
+import { useCallback, useEffect, useState } from 'react';
 import { useLocale, useTranslations } from 'next-intl';
 import { Panel } from '@/components/ui';
 import type { DqSummary } from '@/lib/dq/dashboard';
+import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
+import { quarantineAcceptBody, quarantineControl, sumByMarket } from '@/lib/dq/dashboard-view';
+import { CalendarPanel, ClaimsPanel, ReconciliationPairs } from './panels';
+import type { MarketFilter } from './panels';
+import { DANGER_BG, Detail, Pill, Table, Tile, btn, count, num, pct, s, td } from './primitives';
+import type { Row } from './primitives';
 
-type Row = Record<string, unknown>;
 interface DqResponse {
   summary: DqSummary;
   batches24hTruncated: boolean;
@@ -13,73 +18,26 @@ interface DqResponse {
   freshness: (Row & { status: string; stored_status: string })[];
   quarantine: { rows: Row[]; page: number; pageSize: number; total: number };
   reconciliations: Row[];
-  datasets: string[];
+  datasets?: string[];
+  calendar: CalendarBlock;
+  claims: ClaimsBlock;
+  reconciliationsByPair: ReconciliationsByPair;
   refreshedAt: string;
 }
 type Resolution = 'resolved_accept' | 'resolved_reject';
-type Col = { label: string; num?: boolean };
-
-const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
-const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
-const count = (row: Row, key: string) => s((row.counts as Record<string, unknown> | null)?.[key] ?? 0);
-// Fixed semantic tones: never text-up/text-down, which flip with the market colour scheme.
-const STATUS_TONE: Record<string, string> = {
-  fresh: '', success: '', stale: 'text-warn', partial: 'text-warn', running: 'text-text-dim',
-  missing: 'text-text-muted', error: 'text-danger', failed: 'text-danger', rejected: 'text-danger',
-};
-// Tailwind 3 cannot apply an opacity modifier to a var() colour, so mix it explicitly.
-const DANGER_BG = 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]';
-
-function Pill({ value }: { value: string }) {
-  return <span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[value] ?? 'text-text-dim'}`}>{value}</span>;
-}
-
-function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
-  return (
-    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
-      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
-      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
-      {note ? <div className="mt-1 truncate text-[11px] text-text-muted">{note}</div> : null}
-    </div>
-  );
-}
-
-function Table({ head, children, empty }: { head: Col[]; children: ReactNode[]; empty: string }) {
-  return (
-    <div className="overflow-x-auto rounded-md border border-border">
-      <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
-        <thead className="bg-bg-card text-text-dim"><tr>{head.map((h) => <th key={h.label} scope="col" className={`whitespace-nowrap px-2 py-1.5 font-medium ${h.num ? 'text-right' : ''}`}>{h.label}</th>)}</tr></thead>
-        <tbody className="divide-y divide-border">
-          {children.length ? children : <tr><td colSpan={head.length} className="px-2 py-3 text-text-muted">{empty}</td></tr>}
-        </tbody>
-      </table>
-    </div>
-  );
-}
-
-function Detail({ value, className }: { value: unknown; className?: string }) {
-  const json = JSON.stringify(value ?? {});
-  return (
-    <details className={className}>
-      <summary className="cursor-pointer truncate font-mono text-text-muted">{json}</summary>
-      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-card p-2 font-mono text-[11px]">{JSON.stringify(value ?? {}, null, 2)}</pre>
-    </details>
-  );
-}
-
-const td = 'whitespace-nowrap px-2 py-1.5';
-const num = `${td} text-right tabular-nums`;
 
 export function AdminDqClient() {
   const t = useTranslations('admin.dq');
   const locale = useLocale();
   const [dataset, setDataset] = useState('');
+  const [market, setMarket] = useState<MarketFilter>('');
   const [page, setPage] = useState(1);
   const [data, setData] = useState<DqResponse | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [notice, setNotice] = useState<string | null>(null);
   const [pending, setPending] = useState<string | null>(null);
+  const [choice, setChoice] = useState<Record<string, number | string>>({});
   const [tick, setTick] = useState(0);
   const reload = useCallback(() => setTick((n) => n + 1), []);
 
@@ -87,6 +45,7 @@ export function AdminDqClient() {
     const controller = new AbortController();
     const qs = new URLSearchParams({ page: String(page) });
     if (dataset) qs.set('dataset', dataset);
+    if (market) qs.set('market', market);
     setLoading(true);
     fetch(`/api/admin/dq?${qs}`, { signal: controller.signal, cache: 'no-store' })
       .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<DqResponse>; })
@@ -98,24 +57,30 @@ export function AdminDqClient() {
       })
       .catch((e) => { if (e instanceof Error && e.name === 'AbortError') return; setError(t('loadFailed')); setLoading(false); });
     return () => controller.abort();
-  }, [dataset, page, tick, t]);
+  }, [dataset, market, page, tick, t]);
 
   const time = (v: unknown) => {
     const d = new Date(String(v ?? ''));
     return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
   };
 
-  async function resolve(id: string, status: Resolution) {
-    setPending(id);
-    setError(null);
-    setNotice(null);
+  /** One POST helper for quarantine and claims; 409 bodies carry a code shown as a notice. */
+  async function post(url: string, id: string, body: Record<string, unknown>) {
+    setPending(id); setError(null); setNotice(null);
     try {
-      const r = await fetch(`/api/admin/dq/quarantine/${id}`, {
-        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }), cache: 'no-store',
-      });
-      if (r.ok) reload();
-      else if (r.status === 409) { setNotice(t('alreadyResolved')); reload(); }
-      else if (r.status === 404) { setError(t('notFound')); reload(); }
+      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
+      if (r.ok) {
+        const j = (await r.json().catch(() => ({}))) as { restore?: { restore_note?: string } };
+        if (j.restore?.restore_note === 'no_rows_promoted') setNotice(t('quarantine.noRowsPromoted'));
+        reload();
+      } else if (r.status === 409) {
+        // The claims route answers 409 {error:<code>}; the quarantine route keeps {id, outcome} and may add
+        // detail.restore_note or a top-level restore_note (plan 3 接口对齐记录 #9). All three are read.
+        const j = (await r.json().catch(() => ({}))) as { error?: string; outcome?: string; restore_note?: string; detail?: { restore_note?: string } };
+        const code = j.detail?.restore_note ?? j.restore_note ?? j.error ?? j.outcome;
+        setNotice(code && t.has(`conflicts.${code}`) ? t(`conflicts.${code}`) : t('alreadyResolved'));
+        reload();
+      } else if (r.status === 404) { setError(t('notFound')); reload(); }
       else setError(t('resolveFailed'));
     } catch {
       setError(t('resolveFailed'));
@@ -123,13 +88,21 @@ export function AdminDqClient() {
       setPending(null);
     }
   }
+  const resolve = (id: string, body: { status: Resolution; chosen_candidate_index?: number; keep_fact_id?: string }) => post(`/api/admin/dq/quarantine/${id}`, id, body);
+  const resolveClaim = (id: string, body: Record<string, unknown>) => post(`/api/admin/dq/claims/${id}`, id, body);
 
   const busy = loading || pending !== null;
   const sm = data?.summary;
   const q = data?.quarantine;
+  const cal = data?.calendar;
+  const today = (data?.refreshedAt ?? new Date().toISOString()).slice(0, 10);
   const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
-  // Options: the server's registry ∪ loaded datasets (spec 3 §6.3), plus the current selection so it never disappears.
-  const datasets = Array.from(new Set([...(data?.datasets ?? []), ...(dataset ? [dataset] : [])])).sort();
+  // Registry inventory (Task 2) ∪ what this response loaded ∪ the current selection, so it never disappears.
+  const datasets = Array.from(new Set([
+    ...(data?.datasets ?? []),
+    ...[...(data?.freshness ?? []), ...(data?.batches ?? []), ...(q?.rows ?? [])].map((r) => String(r.dataset)),
+    ...(dataset ? [dataset] : []),
+  ])).sort();
   const by = sm?.batchesByStatus ?? {};
   const batchTotal = Object.values(by).reduce((a, b) => a + b, 0);
   const recShown = data?.reconciliations.length ?? 0;
@@ -137,6 +110,7 @@ export function AdminDqClient() {
   const recTitle = recTotal > recShown
     ? `${t('sections.reconciliations')} · ${t('sections.reconciliationsLatest', { shown: recShown, total: recTotal })}`
     : t('sections.reconciliations');
+  const overdue = sumByMarket(cal?.overdueByMarket);
 
   return (
     <div data-density="data" className="mx-auto max-w-7xl space-y-4">
@@ -154,10 +128,12 @@ export function AdminDqClient() {
       {notice ? <div role="status" className="rounded-md border border-border bg-bg-card px-3 py-2 text-xs text-warn">{notice}</div> : null}
       {error ? <div role="alert" className={`rounded-md ${DANGER_BG} px-3 py-2 text-xs text-danger`}>{error}</div> : null}
 
-      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
+      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
         <Tile label={t('tiles.notFresh')} value={sm ? `${sm.notFresh.length} / ${sm.freshnessTotal}` : '—'}
           tone={sm && sm.notFresh.length > 0 ? 'text-warn' : undefined}
           note={sm ? t('tiles.notFreshNote', sm.notFreshByStatus) : null} />
+        <Tile label={t('tiles.overdue')} value={cal ? overdue : '—'} tone={overdue > 0 ? 'text-danger' : undefined}
+          note={cal ? t('tiles.overdueNote', { us: cal.overdueByMarket.US, cn: cal.overdueByMarket.CN, filed: sumByMarket(cal.filedNotIngestedByMarket), unknown: sumByMarket(cal.unknownUpstreamByMarket) }) : null} />
         <Tile label={t('tiles.openQuarantine')} value={sm ? sm.openQuarantineTotal : '—'} note={t('tiles.openQuarantineNote')} />
         <Tile label={t('tiles.failedReconciliations')} value={sm ? sm.failedReconciliationsTotal : '—'}
           tone={sm && sm.failedReconciliationsTotal > 0 ? 'text-danger' : undefined} />
@@ -165,31 +141,32 @@ export function AdminDqClient() {
           note={sm ? t('tiles.batchesNote', { success: by.success ?? 0, partial: by.partial ?? 0, failed: by.failed ?? 0 }) : null} />
       </div>
 
-      <div className="grid gap-4 lg:grid-cols-2">
-        <Panel title={t('sections.freshness')}>
-          <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.cadence') }, { label: t('columns.lastOk') }, { label: t('columns.status') }, { label: t('columns.stored') }]}>
-            {(data?.freshness ?? []).map((f) => (
-              <tr key={String(f.dataset)}>
-                <td className={`${td} font-mono`}>{s(f.dataset)}</td><td className={td}>{s(f.expected_cadence)}</td>
-                <td className={td}>{time(f.last_ok_at)}</td><td className={td}><Pill value={f.status} /></td>
-                <td className={`${td} font-mono ${f.status !== f.stored_status ? 'text-warn' : 'text-text-dim'}`}>{f.status !== f.stored_status ? `≠ ${f.stored_status}` : f.stored_status}</td>
-              </tr>
-            ))}
-          </Table>
-          <p className="mt-2 text-[11px] text-text-muted">{t('notes.freshness')}</p>
-        </Panel>
-        <Panel title={t('sections.batches')}>
-          <Table empty={t('empty')} head={[{ label: t('columns.started') }, { label: t('columns.dataset') }, { label: t('columns.producer') }, { label: t('columns.batchStatus') }, { label: t('columns.inserted'), num: true }, { label: t('columns.quarantined'), num: true }, { label: t('columns.failed'), num: true }]}>
-            {(data?.batches ?? []).map((b) => (
-              <tr key={String(b.batch_id)}>
-                <td className={td}>{time(b.started_at)}</td><td className={`${td} font-mono`}>{s(b.dataset)}</td><td className={td}>{s(b.producer)}</td>
-                <td className={td}><Pill value={String(b.status)} /></td>
-                <td className={num}>{count(b, 'inserted')}</td><td className={num}>{count(b, 'quarantined')}</td><td className={num}>{count(b, 'failed')}</td>
-              </tr>
-            ))}
-          </Table>
-        </Panel>
-      </div>
+      <Panel title={t('sections.freshness')}>
+        <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.cadence') }, { label: t('columns.lastOk') }, { label: t('columns.status') }, { label: t('columns.stored') }]}>
+          {(data?.freshness ?? []).map((f) => (
+            <tr key={String(f.dataset)}>
+              <td className={`${td} font-mono`}>{s(f.dataset)}</td><td className={td}>{s(f.expected_cadence)}</td>
+              <td className={td}>{time(f.last_ok_at)}</td><td className={td}><Pill value={f.status} /></td>
+              <td className={`${td} font-mono ${f.status !== f.stored_status ? 'text-warn' : 'text-text-dim'}`}>{f.status !== f.stored_status ? `≠ ${f.stored_status}` : f.stored_status}</td>
+            </tr>
+          ))}
+        </Table>
+        <p className="mt-2 text-[11px] text-text-muted">{t('notes.freshness')}</p>
+      </Panel>
+
+      <CalendarPanel t={t} calendar={cal} market={market} onMarket={(m) => setMarket(m)} today={today} busy={busy} />
+
+      <Panel title={t('sections.batches')}>
+        <Table empty={t('empty')} head={[{ label: t('columns.started') }, { label: t('columns.dataset') }, { label: t('columns.producer') }, { label: t('columns.batchStatus') }, { label: t('columns.inserted'), num: true }, { label: t('columns.quarantined'), num: true }, { label: t('columns.failed'), num: true }]}>
+          {(data?.batches ?? []).map((b) => (
+            <tr key={String(b.batch_id)}>
+              <td className={td}>{time(b.started_at)}</td><td className={`${td} font-mono`}>{s(b.dataset)}</td><td className={td}>{s(b.producer)}</td>
+              <td className={td}><Pill value={String(b.status)} /></td>
+              <td className={num}>{count(b, 'inserted')}</td><td className={num}>{count(b, 'quarantined')}</td><td className={num}>{count(b, 'failed')}</td>
+            </tr>
+          ))}
+        </Table>
+      </Panel>
 
       <Panel title={t('sections.quarantine')}>
         <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
@@ -212,26 +189,38 @@ export function AdminDqClient() {
         </div>
         <div className="hidden sm:block">
           <Table empty={t('empty')} head={[{ label: t('columns.time') }, { label: t('columns.dataset') }, { label: t('columns.table') }, { label: t('columns.naturalKey') }, { label: t('columns.reason') }, { label: t('columns.detail') }, { label: t('columns.actions') }]}>
-            {(q?.rows ?? []).map((r) => (
-              <tr key={String(r.id)} className={pending === String(r.id) ? 'opacity-50' : undefined}>
-                <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
-                <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
-                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
-                <td className={td}>{actions(r)}</td>
-              </tr>
-            ))}
+            {(q?.rows ?? []).flatMap((r) => {
+              const id = String(r.id);
+              const control = quarantineControl(r);
+              const inline = control.kind === 'candidates' || control.kind === 'lineage';
+              const main = (
+                <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
+                  <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
+                  <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
+                  <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
+                  <td className="px-2 py-1.5 align-top">{inline ? plainActions(r) : actions(r, 'table')}</td>
+                </tr>
+              );
+              // Canvas: candidate / keep-row choices sit in a sub-row under the item (Quarantine artboard).
+              return inline ? [main, <tr key={`${id}-choice`} className="bg-bg-card"><td colSpan={7} className="px-2 py-2">{choiceBlock(r, 'table')}</td></tr>] : [main];
+            })}
           </Table>
         </div>
         <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
       </Panel>
 
+      <ClaimsPanel t={t} claims={data?.claims} busy={busy} pending={pending} time={time} onResolve={resolveClaim} />
+
       <Panel title={recTitle}>
-        <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }]}>
+        <ReconciliationPairs t={t} byPair={data?.reconciliationsByPair} time={time} />
+        <Table empty={t('empty')} head={[{ label: t('columns.pair') }, { label: t('columns.kind') }, { label: t('columns.outcome') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }, { label: t('columns.detail') }]}>
           {(data?.reconciliations ?? []).map((r) => (
             <tr key={String(r.id)}>
-              <td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.natural_key)}</td>
+              <td className={`${td} font-mono`}>{s(r.pair ?? r.dataset)}</td><td className={td}>{s(r.kind)}</td><td className={td}>{s(r.outcome)}</td>
+              <td className={`${td} font-mono`}>{s(r.natural_key)}</td>
               <td className={td}>{s(r.left_source)}</td><td className={num}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={num}>{s(r.right_value)}</td>
               <td className={`${num} ${r.passed === false ? 'text-danger' : ''}`}>{pct(r.rel_diff)}</td><td className={num}>{pct(r.tolerance)}</td>
+              <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
             </tr>
           ))}
         </Table>
@@ -239,18 +228,62 @@ export function AdminDqClient() {
     </div>
   );
 
-  function actions(row: Row) {
+  /** Accept / reject without a selection. For a restore row the accept button is the restore control (server-computed enablement). */
+  function plainActions(row: Row) {
     const id = String(row.id);
     const key = s(row.natural_key);
-    const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
+    const control = quarantineControl(row);
+    const restore = control.kind === 'restore';
     return (
       <div className="flex gap-2">
-        <button type="button" disabled={busy} aria-label={`${t('accept')} ${key}`} onClick={() => resolve(id, 'resolved_accept')} className={`${btn} text-accent`}>{t('accept')}</button>
-        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, 'resolved_reject')} className={`${btn} text-danger`}>{t('reject')}</button>
+        <button type="button" disabled={busy || (restore && !control.enabled)} aria-label={`${t('accept')} ${key}`}
+          title={restore && !control.enabled ? t(`quarantine.restore.${control.reason}`) : undefined}
+          onClick={() => resolve(id, { status: 'resolved_accept' })} className={`${btn} text-accent`}>{restore ? t('quarantine.restore.action') : t('accept')}</button>
+        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, { status: 'resolved_reject' })} className={`${btn} text-danger`}>{t('reject')}</button>
+      </div>
+    );
+  }
+
+  function choiceBlock(row: Row, surface: 'table' | 'card') {
+    const id = String(row.id);
+    const control = quarantineControl(row);
+    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
+    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
+    const body = quarantineAcceptBody(control, choice[id] ?? null);
+    return (
+      <div className="space-y-2">
+        <fieldset className="space-y-1 text-xs">
+          <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
+          {options.map((o) => (
+            <label key={String(o.value)} className="flex items-center gap-2 font-mono">
+              <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
+              <span className="break-all">{o.label}</span>
+            </label>
+          ))}
+        </fieldset>
+        <button type="button" disabled={busy || body === null} onClick={() => body && resolve(id, body)} className={`${btn} text-accent`}>
+          {control.kind === 'candidates' ? t('quarantine.adopt', { n: typeof choice[id] === 'number' ? Number(choice[id]) : '—' }) : t('quarantine.keep')}
+        </button>
       </div>
     );
   }
 
+  function actions(row: Row, surface: 'table' | 'card') {
+    const control = quarantineControl(row);
+    if (control.kind === 'candidates' || control.kind === 'lineage') {
+      return <div className="space-y-2">{choiceBlock(row, surface)}{plainActions(row)}</div>;
+    }
+    if (control.kind === 'restore') {
+      return (
+        <div className="space-y-1">
+          {plainActions(row)}
+          <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div>
+        </div>
+      );
+    }
+    return plainActions(row);
+  }
+
   function quarantineCard(row: Row) {
     return (
       <div key={String(row.id)} className={`space-y-1 p-3 text-xs ${pending === String(row.id) ? 'opacity-50' : ''}`}>
@@ -258,7 +291,7 @@ export function AdminDqClient() {
         <div className="break-all font-mono">{s(row.natural_key)}</div>
         <div className="text-text-dim">{s(row.reason_code)}</div>
         <Detail value={row.detail} className="min-w-0" />
-        <div className="py-1">{actions(row)}</div>
+        <div className="py-1">{actions(row, 'card')}</div>
       </div>
     );
   }
diff --git a/src/app/(app)/admin/dq/panels.tsx b/src/app/(app)/admin/dq/panels.tsx
new file mode 100644
index 00000000..4de711ad
--- /dev/null
+++ b/src/app/(app)/admin/dq/panels.tsx
@@ -0,0 +1,215 @@
+'use client';
+
+// Plan-3 panels of /admin/dq (spec §7.2; layout per the Claude Design canvas named in the Task 19b
+// brief): filing calendar, identifier claims (evidence_only amendment form), reconciliation counts
+// by pair. Pure rules live in src/lib/dq/dashboard-view.ts; tokens and components are the existing ones.
+
+import { useState } from 'react';
+import { Panel } from '@/components/ui';
+import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
+import { AMEND_METHODS, amendBody, claimMode, disclosureTone, overdueDays, suggestedOp, sumByMarket } from '@/lib/dq/dashboard-view';
+import type { AmendForm } from '@/lib/dq/dashboard-view';
+import { Detail, Pill, STATUS_TONE, Table, btn, num, s, td } from './primitives';
+import type { Row, T } from './primitives';
+
+export type MarketFilter = '' | 'US' | 'CN';
+const display = (r: Row) => (r.detail as { display?: { ticker?: unknown; name?: unknown } } | null)?.display ?? {};
+const rowKey = (r: Row) => `${s(r.issuer_id)}|${s(r.market)}|${s(r.report_kind)}|${s(r.period_end)}`;
+
+export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: { t: T; calendar: CalendarBlock | undefined; market: MarketFilter; onMarket: (m: MarketFilter) => void; today: string; busy: boolean }) {
+  const rows = calendar?.rows ?? [];
+  const noRule = calendar?.noRuleRows ?? [];
+  const cols = ['issuer', 'market', 'reportKind', 'periodEnd', 'deadlineState', 'dueDate', 'dueRule', 'expectedDate', 'upstreamFiled', 'disclosureState', 'overdueDays'];
+  const period = (r: Row) => (
+    <>{s(r.period_end)}{r.period_end_estimated === true ? <span className="ml-1 text-text-muted" title={t('calendar.estimatedHint')}>{t('calendar.estimatedMark')}</span> : null}</>
+  );
+  return (
+    <Panel title={t('sections.calendar')}>
+      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
+        <span className="font-mono text-[11px] text-text-dim">
+          {calendar ? t('calendar.counts', {
+            overdue: sumByMarket(calendar.overdueByMarket), filed: sumByMarket(calendar.filedNotIngestedByMarket), unknown: sumByMarket(calendar.unknownUpstreamByMarket),
+            estimated: sumByMarket(calendar.estimatedByMarket), noRule: sumByMarket(calendar.noRuleByMarket),
+          }) : '—'}
+        </span>
+        <label className="flex items-center gap-2 text-text-dim">
+          <span>{t('calendar.market')}</span>
+          <select value={market} disabled={busy} onChange={(e) => onMarket(e.target.value as MarketFilter)} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
+            <option value="">{t('calendar.allMarkets')}</option><option value="US">US</option><option value="CN">CN</option>
+          </select>
+        </label>
+      </div>
+      <p className="mb-2 text-[11px] text-text-muted">{t('calendar.legend')}</p>
+      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
+        {rows.map((r) => {
+          const d = display(r);
+          const late = overdueDays(r, today);
+          return (
+            <div key={rowKey(r)} className="space-y-1 p-3 text-xs">
+              <div className="flex items-center justify-between gap-2"><span><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></span><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></div>
+              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.reportKind')}</span><span className="font-mono">{s(r.market)} · {s(r.report_kind)}</span></div>
+              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.periodEnd')}</span><span className="font-mono">{period(r)}</span></div>
+              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.deadlineState')}</span><span>{t(`calendar.deadline.${s(r.deadline_state)}`)} · <span className="font-mono text-text-dim">{s(r.due_rule)}</span></span></div>
+              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.dueDate')}</span><span className="font-mono">{s(r.due_date)}</span></div>
+              {r.expected_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.expectedDate')}</span><span className="font-mono">{s(r.expected_date)}</span></div> : null}
+              {r.upstream_filed_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.upstreamFiled')}</span><span className="font-mono">{s(r.upstream_filed_date)}</span></div> : null}
+              {late ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.overdueDays')}</span><span className="font-mono text-danger">{late}</span></div> : null}
+            </div>
+          );
+        })}
+        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('calendar.empty')}</div> : null}
+      </div>
+      <div className="hidden sm:block">
+        <Table empty={t('calendar.empty')} head={cols.map((c) => ({ label: t(`calendar.columns.${c}`), num: c === 'overdueDays' }))}>
+          {rows.map((r) => {
+            const d = display(r);
+            const late = overdueDays(r, today);
+            return (
+              <tr key={rowKey(r)}>
+                <td className={td}><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></td>
+                <td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
+                <td className={`${td} font-mono`}>{period(r)}</td>
+                <td className={td}>{t(`calendar.deadline.${s(r.deadline_state)}`)}</td>
+                <td className={`${td} font-mono`}>{s(r.due_date)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
+                <td className={`${td} font-mono`}>{s(r.expected_date)}</td><td className={`${td} font-mono`}>{s(r.upstream_filed_date)}</td>
+                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
+                <td className={`${num} ${late ? 'text-danger' : ''}`}>{late ?? '—'}</td>
+              </tr>
+            );
+          })}
+        </Table>
+      </div>
+      <details className="mt-3 text-xs">
+        <summary className="cursor-pointer text-text-dim">{t('calendar.noRuleTitle', { n: noRule.length })}</summary>
+        <div className="mt-2">
+          <Table empty={t('calendar.noRuleEmpty')} head={['issuer', 'market', 'reportKind', 'periodEnd', 'dueRule', 'disclosureState'].map((c) => ({ label: t(`calendar.columns.${c}`) }))}>
+            {noRule.map((r) => (
+              <tr key={rowKey(r)}>
+                <td className={`${td} font-mono`}>{s(display(r).ticker)}</td><td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
+                <td className={`${td} font-mono`}>{s(r.period_end)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
+                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
+              </tr>
+            ))}
+          </Table>
+        </div>
+      </details>
+      <p className="mt-2 text-[11px] text-text-muted">{t('notes.calendar')}</p>
+    </Panel>
+  );
+}
+
+export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t: T; claims: ClaimsBlock | undefined; busy: boolean; pending: string | null; time: (v: unknown) => string; onResolve: (id: string, body: Record<string, unknown>) => void }) {
+  const [amending, setAmending] = useState<string | null>(null);
+  const rows = claims?.rows ?? [];
+  const title = claims && claims.total > rows.length ? `${t('sections.claims')} · ${t('claims.latest', { shown: rows.length, total: claims.total })}` : t('sections.claims');
+  const controls = (r: Row) => {
+    const id = String(r.id);
+    const mode = claimMode(r.op);
+    if (mode === 'sql_only') return <span className="text-text-muted">{t('claims.sqlOnly')}</span>;
+    return (
+      <div className="flex gap-2">
+        <button type="button" disabled={busy} className={`${btn} text-accent`} aria-label={`${t('accept')} ${id}`}
+          onClick={() => (mode === 'amend' ? setAmending(amending === id ? null : id) : onResolve(id, { status: 'accepted' }))}>{mode === 'amend' ? t('claims.amendAccept') : t('accept')}</button>
+        <button type="button" disabled={busy} className={`${btn} text-danger`} aria-label={`${t('reject')} ${id}`} onClick={() => onResolve(id, { status: 'rejected' })}>{t('reject')}</button>
+      </div>
+    );
+  };
+  const cells = (r: Row) => {
+    const detail = (r.detail ?? {}) as { evidence_kind?: unknown };
+    return [time(r.created_at), s(r.issuer_id).slice(0, 8), s(r.op), s(r.id_type), s(r.value), s(detail.evidence_kind), s(r.source)];
+  };
+  return (
+    <Panel title={title}>
+      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
+        {rows.map((r) => (
+          <div key={String(r.id)} className={`space-y-1 p-3 text-xs ${pending === String(r.id) ? 'opacity-50' : ''}`}>
+            <div className="flex justify-between gap-2 font-mono"><span>{s(r.op)} · {s(r.id_type)}</span><span className="text-text-dim">{time(r.created_at)}</span></div>
+            <div className="break-all font-mono">{s(r.value)}</div>
+            <Detail value={r.detail} className="min-w-0" />
+            <div className="py-1">{controls(r)}</div>
+            {amending === String(r.id) ? <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(String(r.id), body); }} onCancel={() => setAmending(null)} /> : null}
+          </div>
+        ))}
+        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('claims.empty')}</div> : null}
+      </div>
+      <div className="hidden sm:block">
+        <Table empty={t('claims.empty')} head={['time', 'issuer', 'op', 'idType', 'value', 'evidenceKind', 'source', 'detail', 'actions'].map((c) => ({ label: t(`claims.columns.${c}`) }))}>
+          {rows.flatMap((r) => {
+            const id = String(r.id);
+            const main = (
+              <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
+                {cells(r).map((c, i) => <td key={i} className={`${td} ${i > 0 && i < 5 ? 'font-mono' : ''}`}>{c}</td>)}
+                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
+                <td className={td}>{controls(r)}</td>
+              </tr>
+            );
+            if (amending !== id) return [main];
+            return [main, (
+              <tr key={`${id}-amend`} className="bg-bg-card"><td colSpan={9} className="px-2 py-2">
+                <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(id, body); }} onCancel={() => setAmending(null)} />
+              </td></tr>
+            )];
+          })}
+        </Table>
+      </div>
+      <p className="mt-2 text-[11px] text-text-muted">{t('notes.claims')}</p>
+    </Panel>
+  );
+}
+
+function AmendFormView({ t, row, securities, busy, onSubmit, onCancel }: { t: T; row: Row; securities: Row[]; busy: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void }) {
+  const [op, setOp] = useState<AmendForm['op']>(suggestedOp(row.detail));
+  const [security, setSecurity] = useState(securities[0] ? `${s(securities[0].ticker)}|${s(securities[0].valid_from)}` : '');
+  const [date, setDate] = useState('');
+  const [method, setMethod] = useState<string>(AMEND_METHODS[op][0]);
+  const [error, setError] = useState<string | null>(null);
+  const [ticker, validFrom] = security.split('|');
+  const field = 'min-h-9 rounded-md border border-border bg-bg-elevated px-2 font-mono text-text';
+  return (
+    <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-card p-2 text-xs"
+      onSubmit={(e) => { e.preventDefault(); const r = amendBody({ op, issuerId: String(row.issuer_id), ticker: ticker ?? '', validFrom: validFrom ?? '', date, method }); if (!r.ok) { setError(t(`claims.errors.${r.error}`)); return; } setError(null); onSubmit(r.body); }}>
+      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.op')}
+        <select value={op} onChange={(e) => { const next = e.target.value as AmendForm['op']; setOp(next); setMethod(AMEND_METHODS[next][0]); }} className={field}>
+          <option value="backdate_window">backdate_window</option><option value="close_security">close_security</option>
+        </select>
+      </label>
+      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.security')}
+        <select value={security} onChange={(e) => setSecurity(e.target.value)} className={field}>
+          {securities.map((x) => { const v = `${s(x.ticker)}|${s(x.valid_from)}`; return <option key={v} value={v}>{s(x.ticker)} · {s(x.valid_from)} → {s(x.valid_to)}</option>; })}
+        </select>
+      </label>
+      <label className="flex flex-col gap-1 text-text-dim">{op === 'backdate_window' ? t('claims.amend.newValidFrom') : t('claims.amend.validTo')}
+        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
+      </label>
+      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.method')}
+        <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
+          {AMEND_METHODS[op].map((m) => <option key={m} value={m}>{m}</option>)}
+        </select>
+      </label>
+      <button type="submit" disabled={busy || securities.length === 0} className={`${btn} text-accent`}>{t('claims.amend.submit')}</button>
+      <button type="button" onClick={onCancel} className={btn}>{t('claims.amend.cancel')}</button>
+      {securities.length === 0 ? <span className="text-text-muted">{t('claims.amend.noSecurities')}</span> : null}
+      {error ? <span role="alert" className="text-danger">{error}</span> : null}
+    </form>
+  );
+}
+
+/** Per-pair failure counts as neutral bars (length = failed / max; never up/down colours) plus the pair's latest cycle. */
+export function ReconciliationPairs({ t, byPair, time }: { t: T; byPair: ReconciliationsByPair | undefined; time: (v: unknown) => string }) {
+  const entries = Object.entries(byPair ?? {});
+  const max = Math.max(1, ...entries.map(([, v]) => v.failed));
+  return (
+    <div className="mb-3 space-y-1.5 text-xs">
+      {entries.map(([pair, v]) => (
+        <div key={pair} className="flex flex-wrap items-center gap-x-3 gap-y-1">
+          <span className="w-full min-w-0 break-all font-mono sm:w-72 sm:shrink-0">{pair}</span>
+          <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-sm bg-bg-card" aria-hidden="true"><div className="h-2 bg-text-muted" style={{ width: `${(v.failed / max) * 100}%` }} /></div>
+          <span className={`w-14 text-right font-mono tabular-nums ${v.failed > 0 ? 'text-danger' : 'text-text-dim'}`}>{t('reconciliation.failed', { n: v.failed })}</span>
+          {v.lastCycle
+            ? <span className="flex items-center gap-2"><span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[v.lastCycle.status] ?? 'text-text-dim'}`} title={v.lastCycle.cycle_id}>{t('reconciliation.lastCycle', { status: v.lastCycle.status })}</span><span className="font-mono text-[11px] text-text-muted">{time(v.lastCycle.finished_at)}</span></span>
+            : <span className="text-text-muted">{t('reconciliation.noCycle')}</span>}
+        </div>
+      ))}
+    </div>
+  );
+}
diff --git a/src/app/(app)/admin/dq/primitives.tsx b/src/app/(app)/admin/dq/primitives.tsx
new file mode 100644
index 00000000..7dc9aa3d
--- /dev/null
+++ b/src/app/(app)/admin/dq/primitives.tsx
@@ -0,0 +1,60 @@
+// Shared building blocks of the /admin/dq page (moved out of AdminDqClient.tsx unchanged, plan 3
+// Task 19b) so the new panels reuse them. Existing tokens only.
+import type { ReactNode } from 'react';
+
+export type Row = Record<string, unknown>;
+export type Col = { label: string; num?: boolean };
+export type T = (key: string, values?: Record<string, string | number>) => string;
+
+export const s = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
+export const pct = (v: unknown) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(2)}%`);
+export const count = (row: Row, key: string) => s((row.counts as Record<string, unknown> | null)?.[key] ?? 0);
+// Fixed semantic tones: never text-up/text-down, which flip with the market colour scheme.
+export const STATUS_TONE: Record<string, string> = {
+  fresh: '', success: '', stale: 'text-warn', partial: 'text-warn', running: 'text-text-dim',
+  missing: 'text-text-muted', error: 'text-danger', failed: 'text-danger', rejected: 'text-danger',
+  complete: '', complete_with_gaps: 'text-warn', complete_with_failures: 'text-warn',
+};
+// Tailwind 3 cannot apply an opacity modifier to a var() colour, so mix it explicitly.
+export const DANGER_BG = 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]';
+export const td = 'whitespace-nowrap px-2 py-1.5';
+export const num = `${td} text-right tabular-nums`;
+export const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
+
+export function Pill({ value, tone }: { value: string; tone?: string }) {
+  return <span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${tone ?? STATUS_TONE[value] ?? 'text-text-dim'}`}>{value}</span>;
+}
+
+// The note may wrap (Claude Design canvas: the overdue card's note is not truncated).
+export function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: string }) {
+  return (
+    <div className="min-w-0 rounded-md border border-border bg-bg-elevated p-3">
+      <div className="truncate text-[11px] text-text-dim" title={label}>{label}</div>
+      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
+      {note ? <div className="mt-1 break-words text-[11px] text-text-muted">{note}</div> : null}
+    </div>
+  );
+}
+
+export function Table({ head, children, empty }: { head: Col[]; children: ReactNode[]; empty: string }) {
+  return (
+    <div className="overflow-x-auto rounded-md border border-border">
+      <table className="w-full min-w-[560px] text-left text-xs tabular-nums">
+        <thead className="bg-bg-card text-text-dim"><tr>{head.map((h) => <th key={h.label} scope="col" className={`whitespace-nowrap px-2 py-1.5 font-medium ${h.num ? 'text-right' : ''}`}>{h.label}</th>)}</tr></thead>
+        <tbody className="divide-y divide-border">
+          {children.length ? children : <tr><td colSpan={head.length} className="px-2 py-3 text-text-muted">{empty}</td></tr>}
+        </tbody>
+      </table>
+    </div>
+  );
+}
+
+export function Detail({ value, className }: { value: unknown; className?: string }) {
+  const json = JSON.stringify(value ?? {});
+  return (
+    <details className={className}>
+      <summary className="cursor-pointer truncate font-mono text-text-muted">{json}</summary>
+      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded border border-border bg-bg-card p-2 font-mono text-[11px]">{JSON.stringify(value ?? {}, null, 2)}</pre>
+    </details>
+  );
+}
diff --git a/src/lib/dq/dashboard-view.test.ts b/src/lib/dq/dashboard-view.test.ts
index 1c5ba96c..eacc03e3 100644
--- a/src/lib/dq/dashboard-view.test.ts
+++ b/src/lib/dq/dashboard-view.test.ts
@@ -50,4 +50,15 @@ describe('quarantine inline controls',()=>{
   expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
   expect(quarantineControl({reason_code:'same_day_conflict'})).toEqual({kind:'plain'});
  });
+ it('a row not live-checked (restorable_checked:false, over the per-load cap) shows a distinct unchecked reason, never inputs_changed',()=>{
+  const passing={reason_code:'reconcile_mismatch',restorable:false,detail:{latest_result:{passed:true}}};
+  const unchecked=quarantineControl({...passing,restorable_checked:false});
+  expect(unchecked).toEqual({kind:'restore',enabled:false,reason:'unchecked'});
+  expect(quarantineAcceptBody(unchecked,null)).toBeNull();
+  expect(quarantineControl({...passing,restorable_checked:true})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
+  expect(quarantineControl({...passing,restorable:true,restorable_checked:true})).toEqual({kind:'restore',enabled:true,reason:'passing'});
+  // settled from the stored result alone: the stored reason wins even when the row was not live-checked
+  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{latest_result:{passed:false}}})).toEqual({kind:'restore',enabled:false,reason:'not_passing'});
+  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,restorable_checked:false,detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
+ });
 });
diff --git a/src/lib/dq/dashboard-view.ts b/src/lib/dq/dashboard-view.ts
index a4739f10..b49ceeb9 100644
--- a/src/lib/dq/dashboard-view.ts
+++ b/src/lib/dq/dashboard-view.ts
@@ -35,9 +35,9 @@ export const suggestedOp=(detail:unknown):AmendForm['op']=>{
 };
 
 /** Quarantine inline interactions (spec §7.2): which control a row shows. */
-export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'}|{kind:'plain'};
+export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'|'unchecked'}|{kind:'plain'};
 const str=(v:unknown)=>v===null||v===undefined?'—':String(v);
-export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown}):QuarantineControl{
+export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown;restorable_checked?:unknown}):QuarantineControl{
  const payload=(row.payload??{}) as Record<string,unknown>;
  if(row.reason_code==='ambiguous_value'&&Array.isArray(payload.candidates))
   return {kind:'candidates',options:(payload.candidates as Record<string,unknown>[]).map((c,index)=>({index,label:`${str(c.value)} ${str(c.unit)} · ${str(c.sourceConcept)} · ${str(c.filingRef)}`}))};
@@ -49,6 +49,8 @@ export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;det
   const latest=((row.detail??{}) as {latest_result?:{passed?:unknown}}).latest_result;
   if(!latest)return {kind:'restore',enabled:false,reason:'no_result'};
   if(latest.passed!==true)return {kind:'restore',enabled:false,reason:'not_passing'};
+  // restorable_checked:false = over the per-load live-check cap (or no hash wiring): the row was NOT checked, so never claim its inputs changed
+  if(row.restorable_checked===false&&row.restorable!==true)return {kind:'restore',enabled:false,reason:'unchecked'};
   // server-computed (loadDqDashboard): passed AND latest inputs_hash === inputsHashNow(row)
   return row.restorable===true?{kind:'restore',enabled:true,reason:'passing'}:{kind:'restore',enabled:false,reason:'inputs_changed'};
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
/bin/zsh -lc "cat ../../../AGENTS.md; cat 'src/app/(app)/admin/dq/panels.tsx'; sed -n '240,360p' 'src/app/(app)/admin/dq/AdminDqClient.tsx'; cat src/lib/dq/dashboard-view.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>'use client';

// Plan-3 panels of /admin/dq (spec §7.2; layout per the Claude Design canvas named in the Task 19b
// brief): filing calendar, identifier claims (evidence_only amendment form), reconciliation counts
// by pair. Pure rules live in src/lib/dq/dashboard-view.ts; tokens and components are the existing ones.

import { useState } from 'react';
import { Panel } from '@/components/ui';
import type { CalendarBlock, ClaimsBlock, ReconciliationsByPair } from '@/lib/dq/dashboard-blocks';
import { AMEND_METHODS, amendBody, claimMode, disclosureTone, overdueDays, suggestedOp, sumByMarket } from '@/lib/dq/dashboard-view';
import type { AmendForm } from '@/lib/dq/dashboard-view';
import { Detail, Pill, STATUS_TONE, Table, btn, num, s, td } from './primitives';
import type { Row, T } from './primitives';

export type MarketFilter = '' | 'US' | 'CN';
const display = (r: Row) => (r.detail as { display?: { ticker?: unknown; name?: unknown } } | null)?.display ?? {};
const rowKey = (r: Row) => `${s(r.issuer_id)}|${s(r.market)}|${s(r.report_kind)}|${s(r.period_end)}`;

export function CalendarPanel({ t, calendar, market, onMarket, today, busy }: { t: T; calendar: CalendarBlock | undefined; market: MarketFilter; onMarket: (m: MarketFilter) => void; today: string; busy: boolean }) {
  const rows = calendar?.rows ?? [];
  const noRule = calendar?.noRuleRows ?? [];
  const cols = ['issuer', 'market', 'reportKind', 'periodEnd', 'deadlineState', 'dueDate', 'dueRule', 'expectedDate', 'upstreamFiled', 'disclosureState', 'overdueDays'];
  const period = (r: Row) => (
    <>{s(r.period_end)}{r.period_end_estimated === true ? <span className="ml-1 text-text-muted" title={t('calendar.estimatedHint')}>{t('calendar.estimatedMark')}</span> : null}</>
  );
  return (
    <Panel title={t('sections.calendar')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-mono text-[11px] text-text-dim">
          {calendar ? t('calendar.counts', {
            overdue: sumByMarket(calendar.overdueByMarket), filed: sumByMarket(calendar.filedNotIngestedByMarket), unknown: sumByMarket(calendar.unknownUpstreamByMarket),
            estimated: sumByMarket(calendar.estimatedByMarket), noRule: sumByMarket(calendar.noRuleByMarket),
          }) : '—'}
        </span>
        <label className="flex items-center gap-2 text-text-dim">
          <span>{t('calendar.market')}</span>
          <select value={market} disabled={busy} onChange={(e) => onMarket(e.target.value as MarketFilter)} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
            <option value="">{t('calendar.allMarkets')}</option><option value="US">US</option><option value="CN">CN</option>
          </select>
        </label>
      </div>
      <p className="mb-2 text-[11px] text-text-muted">{t('calendar.legend')}</p>
      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((r) => {
          const d = display(r);
          const late = overdueDays(r, today);
          return (
            <div key={rowKey(r)} className="space-y-1 p-3 text-xs">
              <div className="flex items-center justify-between gap-2"><span><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></span><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.reportKind')}</span><span className="font-mono">{s(r.market)} · {s(r.report_kind)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.periodEnd')}</span><span className="font-mono">{period(r)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.deadlineState')}</span><span>{t(`calendar.deadline.${s(r.deadline_state)}`)} · <span className="font-mono text-text-dim">{s(r.due_rule)}</span></span></div>
              <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.dueDate')}</span><span className="font-mono">{s(r.due_date)}</span></div>
              {r.expected_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.expectedDate')}</span><span className="font-mono">{s(r.expected_date)}</span></div> : null}
              {r.upstream_filed_date ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.upstreamFiled')}</span><span className="font-mono">{s(r.upstream_filed_date)}</span></div> : null}
              {late ? <div className="flex justify-between gap-2"><span className="text-text-dim">{t('calendar.columns.overdueDays')}</span><span className="font-mono text-danger">{late}</span></div> : null}
            </div>
          );
        })}
        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('calendar.empty')}</div> : null}
      </div>
      <div className="hidden sm:block">
        <Table empty={t('calendar.empty')} head={cols.map((c) => ({ label: t(`calendar.columns.${c}`), num: c === 'overdueDays' }))}>
          {rows.map((r) => {
            const d = display(r);
            const late = overdueDays(r, today);
            return (
              <tr key={rowKey(r)}>
                <td className={td}><span className="font-mono">{s(d.ticker)}</span> <span className="text-text-dim">{s(d.name)}</span></td>
                <td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
                <td className={`${td} font-mono`}>{period(r)}</td>
                <td className={td}>{t(`calendar.deadline.${s(r.deadline_state)}`)}</td>
                <td className={`${td} font-mono`}>{s(r.due_date)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
                <td className={`${td} font-mono`}>{s(r.expected_date)}</td><td className={`${td} font-mono`}>{s(r.upstream_filed_date)}</td>
                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
                <td className={`${num} ${late ? 'text-danger' : ''}`}>{late ?? '—'}</td>
              </tr>
            );
          })}
        </Table>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-text-dim">{t('calendar.noRuleTitle', { n: noRule.length })}</summary>
        <div className="mt-2">
          <Table empty={t('calendar.noRuleEmpty')} head={['issuer', 'market', 'reportKind', 'periodEnd', 'dueRule', 'disclosureState'].map((c) => ({ label: t(`calendar.columns.${c}`) }))}>
            {noRule.map((r) => (
              <tr key={rowKey(r)}>
                <td className={`${td} font-mono`}>{s(display(r).ticker)}</td><td className={td}>{s(r.market)}</td><td className={`${td} font-mono`}>{s(r.report_kind)}</td>
                <td className={`${td} font-mono`}>{s(r.period_end)}</td><td className={`${td} font-mono text-text-dim`}>{s(r.due_rule)}</td>
                <td className={td}><Pill value={s(r.disclosure_state)} tone={disclosureTone(String(r.disclosure_state))} /></td>
              </tr>
            ))}
          </Table>
        </div>
      </details>
      <p className="mt-2 text-[11px] text-text-muted">{t('notes.calendar')}</p>
    </Panel>
  );
}

export function ClaimsPanel({ t, claims, busy, pending, time, onResolve }: { t: T; claims: ClaimsBlock | undefined; busy: boolean; pending: string | null; time: (v: unknown) => string; onResolve: (id: string, body: Record<string, unknown>) => void }) {
  const [amending, setAmending] = useState<string | null>(null);
  const rows = claims?.rows ?? [];
  const title = claims && claims.total > rows.length ? `${t('sections.claims')} · ${t('claims.latest', { shown: rows.length, total: claims.total })}` : t('sections.claims');
  const controls = (r: Row) => {
    const id = String(r.id);
    const mode = claimMode(r.op);
    if (mode === 'sql_only') return <span className="text-text-muted">{t('claims.sqlOnly')}</span>;
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy} className={`${btn} text-accent`} aria-label={`${t('accept')} ${id}`}
          onClick={() => (mode === 'amend' ? setAmending(amending === id ? null : id) : onResolve(id, { status: 'accepted' }))}>{mode === 'amend' ? t('claims.amendAccept') : t('accept')}</button>
        <button type="button" disabled={busy} className={`${btn} text-danger`} aria-label={`${t('reject')} ${id}`} onClick={() => onResolve(id, { status: 'rejected' })}>{t('reject')}</button>
      </div>
    );
  };
  const cells = (r: Row) => {
    const detail = (r.detail ?? {}) as { evidence_kind?: unknown };
    return [time(r.created_at), s(r.issuer_id).slice(0, 8), s(r.op), s(r.id_type), s(r.value), s(detail.evidence_kind), s(r.source)];
  };
  return (
    <Panel title={title}>
      <div className="divide-y divide-border rounded-md border border-border sm:hidden">
        {rows.map((r) => (
          <div key={String(r.id)} className={`space-y-1 p-3 text-xs ${pending === String(r.id) ? 'opacity-50' : ''}`}>
            <div className="flex justify-between gap-2 font-mono"><span>{s(r.op)} · {s(r.id_type)}</span><span className="text-text-dim">{time(r.created_at)}</span></div>
            <div className="break-all font-mono">{s(r.value)}</div>
            <Detail value={r.detail} className="min-w-0" />
            <div className="py-1">{controls(r)}</div>
            {amending === String(r.id) ? <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(String(r.id), body); }} onCancel={() => setAmending(null)} /> : null}
          </div>
        ))}
        {rows.length === 0 ? <div className="p-3 text-xs text-text-muted">{t('claims.empty')}</div> : null}
      </div>
      <div className="hidden sm:block">
        <Table empty={t('claims.empty')} head={['time', 'issuer', 'op', 'idType', 'value', 'evidenceKind', 'source', 'detail', 'actions'].map((c) => ({ label: t(`claims.columns.${c}`) }))}>
          {rows.flatMap((r) => {
            const id = String(r.id);
            const main = (
              <tr key={id} className={pending === id ? 'opacity-50' : undefined}>
                {cells(r).map((c, i) => <td key={i} className={`${td} ${i > 0 && i < 5 ? 'font-mono' : ''}`}>{c}</td>)}
                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                <td className={td}>{controls(r)}</td>
              </tr>
            );
            if (amending !== id) return [main];
            return [main, (
              <tr key={`${id}-amend`} className="bg-bg-card"><td colSpan={9} className="px-2 py-2">
                <AmendFormView t={t} row={r} securities={claims?.securitiesByIssuer[String(r.issuer_id)] ?? []} busy={busy} onSubmit={(body) => { setAmending(null); onResolve(id, body); }} onCancel={() => setAmending(null)} />
              </td></tr>
            )];
          })}
        </Table>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{t('notes.claims')}</p>
    </Panel>
  );
}

function AmendFormView({ t, row, securities, busy, onSubmit, onCancel }: { t: T; row: Row; securities: Row[]; busy: boolean; onSubmit: (body: Record<string, unknown>) => void; onCancel: () => void }) {
  const [op, setOp] = useState<AmendForm['op']>(suggestedOp(row.detail));
  const [security, setSecurity] = useState(securities[0] ? `${s(securities[0].ticker)}|${s(securities[0].valid_from)}` : '');
  const [date, setDate] = useState('');
  const [method, setMethod] = useState<string>(AMEND_METHODS[op][0]);
  const [error, setError] = useState<string | null>(null);
  const [ticker, validFrom] = security.split('|');
  const field = 'min-h-9 rounded-md border border-border bg-bg-elevated px-2 font-mono text-text';
  return (
    <form className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-bg-card p-2 text-xs"
      onSubmit={(e) => { e.preventDefault(); const r = amendBody({ op, issuerId: String(row.issuer_id), ticker: ticker ?? '', validFrom: validFrom ?? '', date, method }); if (!r.ok) { setError(t(`claims.errors.${r.error}`)); return; } setError(null); onSubmit(r.body); }}>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.op')}
        <select value={op} onChange={(e) => { const next = e.target.value as AmendForm['op']; setOp(next); setMethod(AMEND_METHODS[next][0]); }} className={field}>
          <option value="backdate_window">backdate_window</option><option value="close_security">close_security</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.security')}
        <select value={security} onChange={(e) => setSecurity(e.target.value)} className={field}>
          {securities.map((x) => { const v = `${s(x.ticker)}|${s(x.valid_from)}`; return <option key={v} value={v}>{s(x.ticker)} · {s(x.valid_from)} → {s(x.valid_to)}</option>; })}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{op === 'backdate_window' ? t('claims.amend.newValidFrom') : t('claims.amend.validTo')}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-text-dim">{t('claims.amend.method')}
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={field}>
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
          <span className="w-full min-w-0 break-all font-mono sm:w-72 sm:shrink-0">{pair}</span>
          <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-sm bg-bg-card" aria-hidden="true"><div className="h-2 bg-text-muted" style={{ width: `${(v.failed / max) * 100}%` }} /></div>
          <span className={`w-14 text-right font-mono tabular-nums ${v.failed > 0 ? 'text-danger' : 'text-text-dim'}`}>{t('reconciliation.failed', { n: v.failed })}</span>
          {v.lastCycle
            ? <span className="flex items-center gap-2"><span className={`rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-[11px] ${STATUS_TONE[v.lastCycle.status] ?? 'text-text-dim'}`} title={v.lastCycle.cycle_id}>{t('reconciliation.lastCycle', { status: v.lastCycle.status })}</span><span className="font-mono text-[11px] text-text-muted">{time(v.lastCycle.finished_at)}</span></span>
            : <span className="text-text-muted">{t('reconciliation.noCycle')}</span>}
        </div>
      ))}
    </div>
  );
}
          title={restore && !control.enabled ? t(`quarantine.restore.${control.reason}`) : undefined}
          onClick={() => resolve(id, { status: 'resolved_accept' })} className={`${btn} text-accent`}>{restore ? t('quarantine.restore.action') : t('accept')}</button>
        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, { status: 'resolved_reject' })} className={`${btn} text-danger`}>{t('reject')}</button>
      </div>
    );
  }

  function choiceBlock(row: Row, surface: 'table' | 'card') {
    const id = String(row.id);
    const control = quarantineControl(row);
    if (control.kind !== 'candidates' && control.kind !== 'lineage') return null;
    const options = control.kind === 'candidates' ? control.options.map((o) => ({ value: o.index as number | string, label: o.label })) : control.options.map((o) => ({ value: o.factId as number | string, label: o.label }));
    const body = quarantineAcceptBody(control, choice[id] ?? null);
    return (
      <div className="space-y-2">
        <fieldset className="space-y-1 text-xs">
          <legend className="text-text-dim">{control.kind === 'candidates' ? t('quarantine.chooseCandidate') : t('quarantine.keepRow')}</legend>
          {options.map((o) => (
            <label key={String(o.value)} className="flex items-center gap-2 font-mono">
              <input type="radio" name={`choice-${surface}-${id}`} checked={choice[id] === o.value} onChange={() => setChoice((c) => ({ ...c, [id]: o.value }))} disabled={busy} />
              <span className="break-all">{o.label}</span>
            </label>
          ))}
        </fieldset>
        <button type="button" disabled={busy || body === null} onClick={() => body && resolve(id, body)} className={`${btn} text-accent`}>
          {control.kind === 'candidates' ? t('quarantine.adopt', { n: typeof choice[id] === 'number' ? Number(choice[id]) : '—' }) : t('quarantine.keep')}
        </button>
      </div>
    );
  }

  function actions(row: Row, surface: 'table' | 'card') {
    const control = quarantineControl(row);
    if (control.kind === 'candidates' || control.kind === 'lineage') {
      return <div className="space-y-2">{choiceBlock(row, surface)}{plainActions(row)}</div>;
    }
    if (control.kind === 'restore') {
      return (
        <div className="space-y-1">
          {plainActions(row)}
          <div className={`text-[11px] ${control.enabled ? 'text-text-dim' : 'text-text-muted'}`}>{t(`quarantine.restore.${control.reason}`)}</div>
        </div>
      );
    }
    return plainActions(row);
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

exec
/bin/zsh -lc "cat src/lib/dq/dashboard-blocks.ts; cat 'src/app/api/admin/dq/claims/[id]/route.ts'; cat 'src/app/api/admin/dq/quarantine/[id]/route.ts'; sed -n '225,246p' 'src/app/(app)/admin/dq/AdminDqClient.tsx'; cat src/app/api/admin/dq/route.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/dq/dashboard-blocks.ts
// The plan-3 blocks of GET /api/admin/dq (spec §7 table): the filing calendar (per-market counts
// that never depend on the market filter, plus the attention rows and the no-rule rows for the
// selected market), pending identifier claims (with the securities an evidence_only amendment can
// target), and reconciliation failures by pair (distinct natural keys, latest row) with each cycle pair's latest cycle. Reads go
// through TableClient (equality + range filters only); every list is bounded.
import {callRpc,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import type {Market} from '../facts/types';
import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';

export const MARKETS:readonly Market[]=['US','CN'];
export const CALENDAR_ROWS_MAX=100;
export const CALENDAR_NO_RULE_MAX=50;
export const CLAIMS_MAX=50;
export const DUE_SOON_DAYS=7;
export type ByMarket=Record<Market,number>;
export interface CalendarBlock{overdueByMarket:ByMarket;filedNotIngestedByMarket:ByMarket;unknownUpstreamByMarket:ByMarket;noRuleByMarket:ByMarket;estimatedByMarket:ByMarket;rows:Row[];noRuleRows:Row[]}
export interface ClaimsBlock{rows:Row[];total:number;securitiesByIssuer:Record<string,Row[]>}
export type ReconciliationsByPair=Record<string,{failed:number;lastCycle:{cycle_id:string;status:string;finished_at:string|null}|null}>;

const addDaysIso=(iso:string,n:number)=>new Date(Date.parse(`${iso}T00:00:00Z`)+n*86_400_000).toISOString().slice(0,10);
async function byMarket(client:TableClient,match:Row):Promise<ByMarket>{
 const [us,cn]=await Promise.all(MARKETS.map(m=>client.count('dq_filing_expectations',{...match,market:m})));
 return {US:us,CN:cn};
}
/** Attention order: overdue, filed-not-ingested, due within 7 days, unknown upstream; then due date (none last), period end. */
const RANK:Record<string,number>={overdue:0,filed_not_ingested:1,pending:2,unknown_upstream:3};
const rowKey=(r:Row)=>`${r.issuer_id}|${r.market}|${r.report_kind}|${r.period_end}`;

export async function loadCalendarBlock(client:TableClient,market:Market|undefined,now:Date):Promise<CalendarBlock>{
 const today=now.toISOString().slice(0,10);
 const scope:Row=market?{market}:{};
 /**
  * Attention order BEFORE the limit: due date ascending (nulls last), then period end descending. TableClient has one order key,
  * so when the page is full the rows tied on the boundary due date are re-read ordered by period end (a tie beyond that is unspecified).
  */
 const list=async(match:Row,extra:{gte?:Record<string,string>;lt?:Record<string,string>}={})=>{
  const first=await client.select('dq_filing_expectations',{...scope,...match},{orderBy:'due_date',limit:CALENDAR_ROWS_MAX,...extra});
  if(first.length<CALENDAR_ROWS_MAX)return first;
  const edge=first[first.length-1].due_date??null;
  const tied=await client.select('dq_filing_expectations',{...scope,...match,due_date:edge},{orderBy:'period_end',desc:true,limit:CALENDAR_ROWS_MAX,...extra});
  return [...first.filter(r=>(r.due_date??null)!==edge),...tied];
 };
 const [overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,overdue,filed,soon,unknown,noRuleRows]=await Promise.all([
  byMarket(client,{disclosure_state:'overdue'}),byMarket(client,{disclosure_state:'filed_not_ingested'}),byMarket(client,{disclosure_state:'unknown_upstream'}),
  byMarket(client,{deadline_state:'no_rule'}),byMarket(client,{period_end_estimated:true}),
  list({disclosure_state:'overdue'}),list({disclosure_state:'filed_not_ingested'}),
  list({disclosure_state:'pending'},{gte:{due_date:today},lt:{due_date:addDaysIso(today,DUE_SOON_DAYS+1)}}),
  list({disclosure_state:'unknown_upstream'}),
  client.select('dq_filing_expectations',{...scope,deadline_state:'no_rule'},{orderBy:'period_end',desc:true,limit:CALENDAR_NO_RULE_MAX}),
 ]);
 const seen=new Set<string>();
 const rows=[...overdue,...filed,...soon,...unknown].filter(r=>{const k=rowKey(r);if(seen.has(k))return false;seen.add(k);return true;})
  .sort((a,b)=>(RANK[String(a.disclosure_state)]??9)-(RANK[String(b.disclosure_state)]??9)||String(a.due_date??'9999').localeCompare(String(b.due_date??'9999'))||String(b.period_end).localeCompare(String(a.period_end))||rowKey(a).localeCompare(rowKey(b)))
  .slice(0,CALENDAR_ROWS_MAX);
 return {overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,rows,noRuleRows};
}

export async function loadClaimsBlock(client:TableClient):Promise<ClaimsBlock>{
 const [rows,total]=await Promise.all([
  client.select('issuer_identifier_claims',{status:'pending'},{orderBy:'created_at',desc:true,limit:CLAIMS_MAX}),
  client.count('issuer_identifier_claims',{status:'pending'}),
 ]);
 const issuers=[...new Set(rows.filter(r=>r.op==='evidence_only').map(r=>String(r.issuer_id)))];
 const lists=await Promise.all(issuers.map(id=>selectAll(client,'issuer_securities',{issuer_id:id},'valid_from')));
 const securitiesByIssuer=Object.fromEntries(issuers.map((id,i)=>[id,lists[i].map(s=>({ticker:s.ticker,valid_from:s.valid_from,valid_to:s.valid_to??null,valid_from_method:s.valid_from_method??null,is_primary:s.is_primary===true}))]));
 return {rows,total,securitiesByIssuer};
}

/**
 * Failed count per pair = distinct natural keys whose LATEST row failed, aggregated in SQL (dq_reconcile_failed_counts):
 * out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count.
 * Known limitation: a key that later leaves the sample keeps its last failed row in the count.
 */
export async function loadReconciliationsByPair(client:TableClient):Promise<ReconciliationsByPair>{
 const cyclePairs=new Set<string>(CYCLE_PAIR_IDS);
 const counts=await callRpc(client,'dq_reconcile_failed_counts',{});
 const failedBy=new Map<string,number>(Array.isArray(counts)?counts.map((r:Row)=>[String(r.pair),Number(r.failed)] as [string,number]):[]);
 const entries=await Promise.all(RECONCILE_PAIR_IDS.map(async pair=>{
  const cycles=cyclePairs.has(pair)?await client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):[] as Row[];
  const c=cycles[0];
  return [pair,{failed:failedBy.get(pair)??0,lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
 }));
 return Object.fromEntries(entries);
}
// src/app/api/admin/dq/claims/[id]/route.ts
// Identifier-claim review (data foundation 3 spec §7.1). Order mirrors the landed quarantine route:
// admin session (401/403) → JSON content type (415) → same Origin (403) → UUID (400) → body. An
// `amend` (only with status 'accepted'; required for evidence_only claims, enforced by the SQL
// function) is validated with validateClaimDetail against the stored claim's evidence before the
// call. resolve_identifier_claim is the final authority: its coded errors are 409, anything else 500.
import { NextResponse } from 'next/server';
import { AdminForbidden, AdminUnauthenticated, requireAdminUser } from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { validateClaimDetail } from '@/lib/entities/claims';
import type { ClaimDetail, ClaimIdType, ClaimOp } from '@/lib/entities/types';
import { audit, type ResearchSupabase } from '@/lib/research/store';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['accepted', 'rejected'] as const;
type Status = typeof STATUSES[number];
type AmendOp = Exclude<ClaimOp, 'legacy' | 'evidence_only'>;
const AMEND_OPS: readonly AmendOp[] = ['attach_security', 'close_security', 'backdate_window'];   // what resolve_identifier_claim's amend path allows
const CONFLICTS = new Set(['already_resolved', 'legacy_claim', 'amend_required', 'value_conflict', 'ownership_conflict', 'already_closed', 'issuer_not_active']);
interface Amend { op: AmendOp; target: ClaimDetail['target']; params: Record<string, unknown> }
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; details?: string | null } | null }> };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function parseAmend(v: unknown): Amend | null {
  if (!isObj(v) || Object.keys(v).some((k) => !['op', 'target', 'params'].includes(k))) return null;
  if (typeof v.op !== 'string' || !(AMEND_OPS as readonly string[]).includes(v.op)) return null;
  if (!isObj(v.target) || typeof v.target.issuer_id !== 'string' || !isObj(v.params)) return null;
  return { op: v.op as AmendOp, target: v.target as unknown as ClaimDetail['target'], params: v.params };
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
    const status = isObj(body) ? body.status : undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status as Status)) {
      return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
    }
    const rawAmend = isObj(body) ? body.amend : undefined;
    let amend: Amend | null = null;
    if (rawAmend !== undefined && rawAmend !== null) {
      if (status !== 'accepted') return NextResponse.json({ error: 'amend_not_applicable' }, { status: 400 });
      amend = parseAmend(rawAmend);
      if (!amend) return NextResponse.json({ error: 'invalid_amend' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const [claim] = await supabaseTableClient(admin).select('issuer_identifier_claims', { id }, { limit: 1 });
    if (!claim) return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });
    if (amend) {
      // an amendment completes an evidence_only claim; every other claim is accepted as filed
      if (claim.op !== 'evidence_only') return NextResponse.json({ id, error: 'amend_not_applicable' }, { status: 400 });
      if (amend.target.issuer_id !== claim.issuer_id) return NextResponse.json({ error: 'invalid_amend', detail: 'target_issuer_mismatch' }, { status: 400 });
      const stored = isObj(claim.detail) ? claim.detail : {};
      // attach_security inserts params.ticker (the claim value of an evidence_only claim is an accession): it must be present and valid
      if (amend.op === 'attach_security' && typeof amend.params.ticker !== 'string') return NextResponse.json({ error: 'invalid_amend', detail: 'params.ticker' }, { status: 400 });
      const check = validateClaimDetail(amend.op, claim.id_type as ClaimIdType, { ...stored, target: amend.target, params: amend.params } as unknown as ClaimDetail,
        amend.op === 'attach_security' ? amend.params.ticker as string : undefined);
      if (!check.ok) return NextResponse.json({ error: 'invalid_amend', detail: check.error }, { status: 400 });
    }

    const { data, error } = await (admin as unknown as RpcClient).rpc('resolve_identifier_claim', { p_id: id, p_status: status, p_resolved_by: user.id, p_amend: amend });
    if (error) {
      if (CONFLICTS.has(error.message)) return NextResponse.json({ id, error: error.message }, { status: 409 });
      if (error.message === 'claim_not_found') return NextResponse.json({ id, error: 'claim_not_found' }, { status: 404 });   // deleted between the read and the rpc (Task 1b P0002)
      console.error('[admin/dq/claims]', error.message, error.details ?? '');
      return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
    }
    const out = isObj(data) ? data : {};
    const result = { id, status, op: typeof out.op === 'string' ? out.op : String(claim.op), applied: out.applied === true, amended: out.amended === true };
    // The resolution is committed: an audit failure is logged, never turned into a retry-inviting 500.
    try {
      await audit({ supabase: admin as unknown as ResearchSupabase, userId: user.id }, 'dq.claim_resolve', id, result);
    } catch (auditError) {
      console.error('[admin/dq/claims] audit failed', auditError instanceof Error ? auditError.message : auditError);
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AdminUnauthenticated) return NextResponse.json({ error: 'authentication required' }, { status: 401 });
    if (error instanceof AdminForbidden) return NextResponse.json({ error: 'admin role required' }, { status: 403 });
    console.error('[admin/dq/claims]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'claim resolve unavailable' }, { status: 500 });
  }
}
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
          ))}
        </Table>
      </Panel>
    </div>
  );

  /** Accept / reject without a selection. For a restore row the accept button is the restore control (server-computed enablement). */
  function plainActions(row: Row) {
    const id = String(row.id);
    const key = s(row.natural_key);
    const control = quarantineControl(row);
    const restore = control.kind === 'restore';
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy || (restore && !control.enabled)} aria-label={`${t('accept')} ${key}`}
          title={restore && !control.enabled ? t(`quarantine.restore.${control.reason}`) : undefined}
          onClick={() => resolve(id, { status: 'resolved_accept' })} className={`${btn} text-accent`}>{restore ? t('quarantine.restore.action') : t('accept')}</button>
        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, { status: 'resolved_reject' })} className={`${btn} text-danger`}>{t('reject')}</button>
      </div>
    );
  }

import { NextResponse } from 'next/server';
import {
  AdminForbidden,
  AdminUnauthenticated,
  requireAdminUser,
} from '@/lib/admin/auth';
import { supabaseTableClient } from '@/lib/db/table-client';
import { loadDqDashboard, parseDqQuery } from '@/lib/dq/dashboard';
import { restoreInputsHashNow } from '@/lib/dq/reconcile/deps';
import { getAdminSupabase } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const parsed = parseDqQuery(new URL(request.url).searchParams);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const admin = getAdminSupabase();
    const client = supabaseTableClient(admin);
    return NextResponse.json(
      await loadDqDashboard(client, parsed.query, new Date(), { inputsHashNow: restoreInputsHashNow(admin) }),
    );
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
/bin/zsh -lc "rg -n 'display:|ticker:.*name|deadline_state:' src/lib/dq/calendar; sed -n '278,304p' src/lib/dq/facts-resolver.ts; rg -n 'display:' src/lib | head -25; git status --short; find . -name CLAUDE.md -o -name AGENTS.override.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 325ms:
rg: src/lib/dq/calendar: IO error for operation on src/lib/dq/calendar: No such file or directory (os error 2)
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
src/lib/dq/calendar.integration.test.ts:147:  expect(at(r,'2026-09-30').detail).toMatchObject({rules_version:'filing-calendar/1',display:{name:'ZZ Calendar X'},upstream_sha256:SHA_X});
src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm:6:<div style="display:none"><ix:header><ix:resources>
src/lib/dq/calendar-sync.test.ts:95:  expect(a[0].detail).toMatchObject({display:{ticker:'T0',name:'Issuer 0'},upstream_sha256:'sub-sha',rules_version:'filing-calendar/1'});
src/lib/dq/calendar-sync.test.ts:312:  expect(rows[0].detail).toMatchObject({schedule_unavailable:'no_token',display:{ticker:'600000.SH',name:'Issuer 0'}});
src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm:6:<div style="display:none"><ix:header><ix:resources>
src/lib/dq/calendar-sync.ts:209:  return {...r,detail:{...r.detail,display:shown,...cite,...(manifest?{upstream_pages:manifest}:{}),...(scheduleReason?{schedule_unavailable:scheduleReason}:{})}};
src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm:8:<div style="display:none"><ix:header><ix:hidden>
src/lib/dq/reconcile/ixbrl-trim.ts:128:  `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
src/lib/dq/reconcile/ixbrl.test.ts:23:const doc=(body:string,res=RES)=>`${HEAD}<body><div style="display:none"><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
src/lib/research/ingest/__fixtures__/collectors/hkex-titlesearch-0268.html:20:<form id="j_idt10" name="j_idt10" method="post" action="/search/titlesearch.xhtml;jsessionid=9LEbAbAESsJejztA-GeHX0g3hqqv3_Wp5u60KrLR.s107" enctype="application/x-www-form-urlencoded" style="display: none;">
src/lib/research/ingest/__fixtures__/collectors/hkex-titlesearch-0268.html:72:    <div class="container content-container title-search-container content-container-reset table-mobile-list-container" style="display:  ">
src/lib/research/ingest/__fixtures__/collectors/hkex-titlesearch-0268.html:73:        <input id="LISTING_CAT_LINK" type="hidden" value="https://www.hkex.com.hk/eng/rulesreg/listrules/listsptop/listoc/co_inf.htm" style="display: none;" />
src/lib/research/ingest/__fixtures__/collectors/hkex-titlesearch-0268.html:74:        <input id="lang" type="hidden" value="C" style="display: none;" />
src/lib/research/ingest/__fixtures__/collectors/hkex-empty-0268.html:20:<form id="j_idt10" name="j_idt10" method="post" action="/search/titlesearch.xhtml;jsessionid=AoW6d77L7qKXAVVw68BN9SU7-q33D-UVy5n_7s9A.s107" enctype="application/x-www-form-urlencoded" style="display: none;">
src/lib/research/ingest/__fixtures__/collectors/hkex-empty-0268.html:72:    <div class="container content-container title-search-container content-container-reset table-mobile-list-container" style="display:  ">
src/lib/research/ingest/__fixtures__/collectors/hkex-empty-0268.html:73:        <input id="LISTING_CAT_LINK" type="hidden" value="https://www.hkex.com.hk/eng/rulesreg/listrules/listsptop/listoc/co_inf.htm" style="display: none;" />
src/lib/research/ingest/__fixtures__/collectors/hkex-empty-0268.html:74:        <input id="lang" type="hidden" value="C" style="display: none;" />
src/lib/research/ingest/__fixtures__/collectors/edgar-8k-pltr-20260803.htm:8:<title>pltr-20260803</title></head><body><div style="display:none"><ix:header><ix:hidden><ix:nonNumeric contextRef="c-1" name="dei:EntityCentralIndexKey" id="f-21">0001321655</ix:nonNumeric><ix:nonNumeric contextRef="c-1" name="dei:AmendmentFlag" format="ixt:fixed-false" id="f-22">FALSE</ix:nonNumeric></ix:hidden><ix:references xml:lang="en-US"><link:schemaRef xlink:type="simple" xlink:href="pltr-20260803.xsd"/></ix:references><ix:resources><xbrli:context id="c-1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0001321655</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2026-08-03</xbrli:startDate><xbrli:endDate>2026-08-03</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header></div><div id="idaae970afd8541228a9862fd9e69974e_1"></div><div style="min-height:36pt;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div><div style="text-align:justify"><span style="color:#000000;font-family:'Arial',sans-serif;font-size:5pt;font-weight:400;line-height:115%;text-decoration:underline">________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________</span></div><div style="text-align:justify"><span><br/></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:16pt;font-weight:700;line-height:115%">UNITED STATES</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:16pt;font-weight:700;line-height:115%">SECURITIES AND EXCHANGE COMMISSION</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%">Washington, D.C. 20549</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">_________________________</span></div><div style="text-align:center"><span><br/></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:16pt;font-weight:700;line-height:115%">FORM <ix:nonNumeric contextRef="c-1" name="dei:DocumentType" id="f-1">8-K</ix:nonNumeric></span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">_________________________</span></div><div style="text-align:justify"><span><br/></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%">CURRENT REPORT</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%">Pursuant to Section 13 or 15(d)</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%">of the Securities Exchange Act of 1934</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%">Date of Report (date of earliest event reported)</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:11pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:DocumentPeriodEndDate" format="ixt:date-monthname-day-year-en" id="f-2">August&#160;3, 2026</ix:nonNumeric></span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">_________________________</span></div><div style="text-align:center"><span><br/></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:21.5pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityRegistrantName" id="f-3">Palantir Technologies Inc.</ix:nonNumeric></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%">(Exact name of registrant as specified in its charter)</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">_________________________</span></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:100.000%"><tr><td style="width:1.0%"/><td style="width:31.490%"/><td style="width:0.1%"/><td style="width:0.1%"/><td style="width:0.914%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:31.490%"/><td style="width:0.1%"/><td style="width:0.1%"/><td style="width:0.914%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:31.492%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityIncorporationStateCountryCode" format="ixt-sec:stateprovnameen" id="f-4">Delaware</ix:nonNumeric></span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityFileNumber" id="f-5">001-39540</ix:nonNumeric></span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityTaxIdentificationNumber" id="f-6">68-0551851</ix:nonNumeric></span></div></td></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">(State or other jurisdiction of</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">incorporation or organization)</span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">(Commission</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">File Number)</span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">(I.R.S. Employer</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">Identification Number)</span></div></td></tr></table></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityAddressAddressLine1" id="f-7">19505 Biscayne Blvd., Suite 2350</ix:nonNumeric></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:EntityAddressCityOrTown" id="f-8">Aventura</ix:nonNumeric>, <ix:nonNumeric contextRef="c-1" name="dei:EntityAddressStateOrProvince" format="ixt-sec:stateprovnameen" id="f-9">Florida</ix:nonNumeric> <ix:nonNumeric contextRef="c-1" name="dei:EntityAddressPostalZipCode" id="f-10">33180</ix:nonNumeric></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">(Address of principal executive offices and zip code)</span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:CityAreaCode" id="f-11">(720)</ix:nonNumeric> <ix:nonNumeric contextRef="c-1" name="dei:LocalPhoneNumber" id="f-12">358-3679</ix:nonNumeric></span></div><div style="text-align:center;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">(Registrant&#8217;s telephone number, including area code)</span></div><div style="text-align:justify"><span><br/></span></div><div style="text-align:justify"><span><br/></span></div><div style="text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Check the appropriate box below if the Form 8-K filing is intended to simultaneously satisfy the filing obligation of the registrant under any of the following provisions:</span></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:94.339%"><tr><td style="width:1.0%"/><td style="width:3.364%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.405%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:88.931%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Arial',sans-serif;font-size:9pt;font-weight:400;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:WrittenCommunications" format="ixt-sec:boolballotbox" id="f-13">&#9744;</ix:nonNumeric></span></div></td><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Written communications pursuant to Rule 425 under the Securities Act (17 CFR 230.425)</span></div></td></tr></table></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:94.199%"><tr><td style="width:1.0%"/><td style="width:3.370%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.414%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:88.916%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Arial',sans-serif;font-size:9pt;font-weight:400;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:SolicitingMaterial" format="ixt-sec:boolballotbox" id="f-14">&#9744;</ix:nonNumeric></span></div></td><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Soliciting material pursuant to Rule 14a-12 under the Exchange Act (17 CFR 240.14a-12)</span></div></td></tr></table></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:94.339%"><tr><td style="width:1.0%"/><td style="width:3.364%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.405%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:88.931%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Arial',sans-serif;font-size:9pt;font-weight:400;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:PreCommencementTenderOffer" format="ixt-sec:boolballotbox" id="f-15">&#9744;</ix:nonNumeric></span></div></td><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Pre-commencement communications pursuant to Rule 14d-2(b) under the Exchange Act (17 CFR 240.14d-2(b))</span></div></td></tr></table></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:94.339%"><tr><td style="width:1.0%"/><td style="width:3.364%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.405%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:88.931%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Arial',sans-serif;font-size:9pt;font-weight:400;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:PreCommencementIssuerTenderOffer" format="ixt-sec:boolballotbox" id="f-16">&#9744;</ix:nonNumeric></span></div></td><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Pre-commencement communications pursuant to Rule 13e-4(c) under the Exchange Act (17 CFR 240.13e-4(c))</span></div></td></tr></table></div><div style="text-align:justify;text-indent:12.5pt"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Securities registered pursuant to Section 12(b) of the Act:</span></div><div style="text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:100.000%"><tr><td style="width:1.0%"/><td style="width:31.490%"/><td style="width:0.1%"/><td style="width:0.1%"/><td style="width:0.914%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:31.490%"/><td style="width:0.1%"/><td style="width:0.1%"/><td style="width:0.914%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:31.492%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">Title of each class</span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">Trading</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">symbol(s)</span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">Name of each exchange</span></div><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:7pt;font-weight:700;line-height:115%">on which registered</span></div></td></tr><tr><td colspan="3" style="border-top:0.5pt solid #000;padding:1.5pt 1pt;text-align:left;vertical-align:top"><div style="text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:Security12bTitle" id="f-17">Class A Common Stock, par value $0.001 per share</ix:nonNumeric></span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="border-top:0.5pt solid #000;padding:1.5pt 1pt;text-align:center;vertical-align:top"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:TradingSymbol" id="f-18">PLTR</ix:nonNumeric></span></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="border-top:0.5pt solid #000;padding:1.5pt 1pt;text-align:center;vertical-align:top"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%"><ix:nonNumeric contextRef="c-1" name="dei:SecurityExchangeName" format="ixt-sec:exchnameen" id="f-19">The Nasdaq Stock Market LLC</ix:nonNumeric></span></td></tr></table></div><div style="text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Indicate by check mark whether the registrant is an emerging growth company as defined in Rule 405 of the Securities Act of 1933 (&#167;230.405 of this chapter) or Rule 12b-2 of the Securities Exchange Act of 1934 (&#167;240.12b-2 of this chapter).</span></div><div style="margin-bottom:6pt;margin-top:6pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">Emerging growth company  <ix:nonNumeric contextRef="c-1" name="dei:EntityEmergingGrowthCompany" format="ixt-sec:boolballotbox" id="f-20">&#9744;</ix:nonNumeric></span></div><div style="text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:9pt;font-weight:400;line-height:115%">If an emerging growth company, indicate by check mark if the registrant has elected not to use the extended transition period for complying with any new or revised financial accounting standards provided pursuant to Section 13(a) of the Exchange Act.  &#9744;</span></div><div style="text-align:justify"><span><br/></span></div><div style="text-align:justify"><span style="color:#000000;font-family:'Arial',sans-serif;font-size:5pt;font-weight:400;line-height:115%;text-decoration:underline">________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________________</span></div><div style="height:36pt;position:relative;width:100%"><div style="bottom:0;position:absolute;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div></div><div id="idaae970afd8541228a9862fd9e69974e_7"></div><hr style="page-break-after:always"/><div style="min-height:36pt;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div><div style="margin-bottom:12pt;margin-top:18pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%">Item 2.02 - Results of Operations and Financial Condition</span></div><div style="margin-bottom:12pt;margin-top:6pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">On August&#160;3, 2026, Palantir Technologies Inc. (including its subsidiaries, &#8220;Palantir,&#8221; or the &#8220;Company&#8221;) issued a press release announcing its financial results for the fiscal quarter ended June 30, 2026. A copy of the press release is attached as Exhibit 99.1 to this Current Report on Form 8-K and is incorporated by reference herein.</span></div><div style="margin-bottom:12pt;margin-top:12pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">The information furnished under this Item 2.02 and in the accompanying Exhibit 99.1 shall not be deemed &#8220;filed&#8221; for purposes of Section 18 of the Securities Exchange Act of 1934, as amended (the &#8220;Exchange Act&#8221;), or otherwise subject to the liabilities of that section, nor incorporated by reference in any filing under the Securities Act of 1933, as amended, or the Exchange Act, regardless of any general incorporation language in such filing, unless expressly incorporated by specific reference in such filing.</span></div><div id="idaae970afd8541228a9862fd9e69974e_10"></div><div style="margin-bottom:12pt;margin-top:18pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%">Item 7.01 - Regulation FD Disclosure</span></div><div style="margin-bottom:12pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">On August&#160;3, 2026, the Company posted a new investor presentation on its investor relations website at https://investors.palantir.com and a letter from its Chief Executive Officer at https://www.palantir.com.</span></div><div id="idaae970afd8541228a9862fd9e69974e_13"></div><div style="-sec-extract:summary;margin-bottom:12pt;margin-top:18pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%">Item 9.01 - Financial Statements and Exhibits</span></div><div style="margin-bottom:12pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">(d) Exhibits</span></div><div style="margin-bottom:12pt;text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:84.091%"><tr><td style="width:1.0%"/><td style="width:11.420%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.075%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:81.205%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:100%">Exhibit Number</span></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:100%">Description</span></td></tr><tr><td colspan="3" style="border-top:1pt solid #000;padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline"><a style="-sec-extract:exhibit;color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline" href="a2026q2ex991pressrelease.htm">99.1</a></span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="border-top:1pt solid #000;padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><div><span style="color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline"><a style="-sec-extract:exhibit;color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline" href="a2026q2ex991pressrelease.htm">Press release, dated August </a><a style="-sec-extract:exhibit;color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline" href="a2026q2ex991pressrelease.htm">3</a><a style="-sec-extract:exhibit;color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline" href="a2026q2ex991pressrelease.htm">, 20</a><a style="-sec-extract:exhibit;color:#0000ff;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%;text-decoration:underline" href="a2026q2ex991pressrelease.htm">26</a></span></div></td></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%">104</span></td><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:bottom"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:100%">Cover Page Interactive Data File (embedded within the Inline XBRL document)</span></td></tr></table></div><div style="height:36pt;position:relative;width:100%"><div style="bottom:0;position:absolute;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div></div><div id="idaae970afd8541228a9862fd9e69974e_16"></div><hr style="page-break-after:always"/><div style="min-height:36pt;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div><div style="margin-bottom:12pt;margin-top:18pt;text-align:center"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%">SIGNATURES</span></div><div style="margin-bottom:12pt;margin-top:12pt;text-align:justify"><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">Pursuant to the requirements of the Securities Exchange Act of 1934, as amended, the registrant has duly caused this report to be signed on its behalf by the undersigned hereunto duly authorized.</span></div><div style="margin-bottom:12pt;margin-top:12pt;text-align:justify"><table style="border-collapse:collapse;display:inline-table;margin-bottom:5pt;vertical-align:text-bottom;width:85.214%"><tr><td style="width:1.0%"/><td style="width:33.166%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:18.669%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:4.171%"/><td style="width:0.1%"/><td style="width:1.0%"/><td style="width:39.594%"/><td style="width:0.1%"/></tr><tr><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">Date: August&#160;3, 2026</span></div></td><td colspan="3" style="padding:0 1pt"/><td colspan="6" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:700;line-height:115%">Palantir Technologies Inc.</span></div></td></tr><tr style="height:12pt"><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">By:</span></div></td><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">/s/ Alexander C. Karp</span></div></td></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="border-top:1pt solid #000000;padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">Alexander C. Karp</span></div></td></tr><tr><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:0 1pt"/><td colspan="3" style="padding:1.5pt 1pt;text-align:left;vertical-align:top"><div><span style="color:#000000;font-family:'Times New Roman',serif;font-size:10pt;font-weight:400;line-height:115%">Chief Executive Officer</span></div></td></tr></table></div><div style="height:36pt;position:relative;width:100%"><div style="bottom:0;position:absolute;width:100%"><div style="margin-bottom:12pt;text-align:justify"><span><br/></span></div></div></div><script type="text/javascript"  src="/QQpw/SBxk/Vaws3/_e/ukQ/ahaE2chLLGzQfS/Ji1MAQ/Zg9QCV/p9Knc"></script></body></html>
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QSfG9d0n' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-41sSa2LV' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/19b-review.md

codex
The new restore-success notification reads the wrong response field, silently hiding successful resolutions that restored no facts.

Review comment:

- [P2] Read the restore notice from the response's detail object — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/app/(app)/admin/dq/AdminDqClient.tsx:73-74
  When a restore closes an item without promoting any facts, the quarantine endpoint returns `detail.restore_note: 'no_rows_promoted'`; its `restore` object contains only promotion and skip information. Checking `restore.restore_note` therefore never displays the warning, and the item disappears from the queue without explaining that no fact was restored. Read `detail.restore_note` on successful responses, as the conflict branch already does.
The new restore-success notification reads the wrong response field, silently hiding successful resolutions that restored no facts.

Review comment:

- [P2] Read the restore notice from the response's detail object — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/app/(app)/admin/dq/AdminDqClient.tsx:73-74
  When a restore closes an item without promoting any facts, the quarantine endpoint returns `detail.restore_note: 'no_rows_promoted'`; its `restore` object contains only promotion and skip information. Checking `restore.restore_note` therefore never displays the warning, and the item disappears from the queue without explaining that no fact was restored. Read `detail.restore_note` on successful responses, as the conflict branch already does.

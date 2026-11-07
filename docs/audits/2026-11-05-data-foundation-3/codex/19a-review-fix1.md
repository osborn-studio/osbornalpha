OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3a1-5c34-76a1-bb85-e0685e30ab5b
--------
user
commit 3afa741
2026-11-07T01:31:01.116543Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 3afa741; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3491ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-xSiSZ7RC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-s7kyfttI' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/18b-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/19a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-s1w8CUV4' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-g7JBptoM' (errno=Operation not permitted)
3afa741e fix(admin/dq): SQL-aggregated distinct-key failure counts, bounded restorable checks, due-date ordering before the calendar limit
 src/lib/db/memory-table-client.ts                  |  9 +++++
 src/lib/dq/dashboard-blocks.test.ts                | 13 ++++++
 src/lib/dq/dashboard-blocks.ts                     | 46 ++++++++++++----------
 src/lib/dq/dashboard.test.ts                       | 40 ++++++++++++++++++-
 src/lib/dq/dashboard.ts                            | 35 +++++++++++++++-
 src/lib/entities/identifiers.integration.test.ts   | 14 ++++++-
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 18 +++++++++
 8 files changed, 152 insertions(+), 25 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -25; for p in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls "$p"/AGENTS* 2>/dev/null; done; git show 3afa741 --; find . -name CLAUDE.md -o -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 369ms:
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ezrVUvlc' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-WyeKnzqf' (errno=Operation not permitted)
commit 3afa741e2a74c16acd9107ef2d9d9480fe0f983f
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 17:30:43 2026 -0800

    fix(admin/dq): SQL-aggregated distinct-key failure counts, bounded restorable checks, due-date ordering before the calendar limit
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 381de045..edc63f9f 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -37,6 +37,15 @@ const isObj=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const sameEvidence=(a:unknown,b:Row)=>isObj(a)&&a.source===b.source&&a.evidence_sha256===b.evidence_sha256;
 const SHA256=/^[0-9a-f]{64}$/;
 const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
+ // twin of dq_reconcile_failed_counts: distinct (pair, natural_key) by latest row (created_at, then id), failures per pair
+ dq_reconcile_failed_counts(rowsOf){
+  const latest=new Map<string,Row>();
+  const key=(r:Row)=>`${String(r.created_at??'')}\u0000${String(r.id)}`;
+  for(const r of rowsOf('dq_reconciliations')){const k=`${String(r.pair)}\u0000${String(r.natural_key)}`;const cur=latest.get(k);if(!cur||key(r)>key(cur))latest.set(k,r);}
+  const out=new Map<string,number>();
+  for(const r of latest.values())if(r.passed===false)out.set(String(r.pair),(out.get(String(r.pair))??0)+1);
+  return [...out].map(([pair,failed])=>({pair,failed}));
+ },
  // Task 14b review: twins of settle_reconcile_cycle / record_cycle_freshness (migration 20261107091000 section 14); detail is only ever
  // touched at the freshness key, so a pending_members entry registered meanwhile survives.
  settle_reconcile_cycle(rowsOf,a){
diff --git a/src/lib/dq/dashboard-blocks.test.ts b/src/lib/dq/dashboard-blocks.test.ts
index 616e90cb..6aa396e3 100644
--- a/src/lib/dq/dashboard-blocks.test.ts
+++ b/src/lib/dq/dashboard-blocks.test.ts
@@ -42,6 +42,19 @@ describe('loadCalendarBlock',()=>{
   expect(b.overdueByMarket).toEqual({US:1,CN:1});
   expect(b.noRuleRows).toEqual([]);
  });
+ it('applies the attention order before the limit: dated rows first, ties on the boundary by period end descending',async()=>{
+  const t=memoryTableClient();
+  const pe=(i:number)=>`${2000+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}-28`;
+  for(let i=0;i<60;i++)await t.insert('dq_filing_expectations',exp(`n-${String(i).padStart(3,'0')}`,'CN',pe(i),'unknown_upstream',{due_date:null}));
+  for(let i=0;i<60;i++)await t.insert('dq_filing_expectations',exp(`d-${String(i).padStart(3,'0')}`,'CN','2026-09-30','unknown_upstream',{due_date:`2026-10-${String(i%28+1).padStart(2,'0')}`}));
+  const rows=(await loadCalendarBlock(t,'CN',NOW)).rows;
+  expect(rows).toHaveLength(CALENDAR_ROWS_MAX);
+  expect(rows.slice(0,60).every(r=>r.due_date!=null)).toBe(true);
+  expect(rows.slice(60).every(r=>r.due_date==null)).toBe(true);
+  expect(rows.slice(60).map(r=>r.period_end)).toEqual(Array.from({length:40},(_,k)=>pe(59-k)));   // the 40 newest null-deadline periods, newest first
+  const dues=rows.slice(0,60).map(r=>String(r.due_date));
+  expect(dues).toEqual([...dues].sort());
+ });
  it('caps the attention list',async()=>{
   const t=memoryTableClient();
   for(let i=0;i<150;i++)await t.insert('dq_filing_expectations',exp(`i-${String(i).padStart(3,'0')}`,'US','2026-06-30','overdue',{due_date:'2026-08-10'}));
diff --git a/src/lib/dq/dashboard-blocks.ts b/src/lib/dq/dashboard-blocks.ts
index 32916298..abb3ba9b 100644
--- a/src/lib/dq/dashboard-blocks.ts
+++ b/src/lib/dq/dashboard-blocks.ts
@@ -4,7 +4,7 @@
 // selected market), pending identifier claims (with the securities an evidence_only amendment can
 // target), and reconciliation failures by pair (distinct natural keys, latest row) with each cycle pair's latest cycle. Reads go
 // through TableClient (equality + range filters only); every list is bounded.
-import {selectAll} from '../db/table-client';
+import {callRpc,selectAll} from '../db/table-client';
 import type {Row,TableClient} from '../db/table-client';
 import type {Market} from '../facts/types';
 import {CYCLE_PAIR_IDS,RECONCILE_PAIR_IDS} from './reconcile/types';
@@ -31,18 +31,28 @@ const rowKey=(r:Row)=>`${r.issuer_id}|${r.market}|${r.report_kind}|${r.period_en
 export async function loadCalendarBlock(client:TableClient,market:Market|undefined,now:Date):Promise<CalendarBlock>{
  const today=now.toISOString().slice(0,10);
  const scope:Row=market?{market}:{};
- const list=(match:Row,orderBy:string,extra:{gte?:Record<string,string>;lt?:Record<string,string>}={})=>client.select('dq_filing_expectations',{...scope,...match},{orderBy,limit:CALENDAR_ROWS_MAX,...extra});
+ /**
+  * Attention order BEFORE the limit: due date ascending (nulls last), then period end descending. TableClient has one order key,
+  * so when the page is full the rows tied on the boundary due date are re-read ordered by period end (a tie beyond that is unspecified).
+  */
+ const list=async(match:Row,extra:{gte?:Record<string,string>;lt?:Record<string,string>}={})=>{
+  const first=await client.select('dq_filing_expectations',{...scope,...match},{orderBy:'due_date',limit:CALENDAR_ROWS_MAX,...extra});
+  if(first.length<CALENDAR_ROWS_MAX)return first;
+  const edge=first[first.length-1].due_date??null;
+  const tied=await client.select('dq_filing_expectations',{...scope,...match,due_date:edge},{orderBy:'period_end',desc:true,limit:CALENDAR_ROWS_MAX,...extra});
+  return [...first.filter(r=>(r.due_date??null)!==edge),...tied];
+ };
  const [overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,overdue,filed,soon,unknown,noRuleRows]=await Promise.all([
   byMarket(client,{disclosure_state:'overdue'}),byMarket(client,{disclosure_state:'filed_not_ingested'}),byMarket(client,{disclosure_state:'unknown_upstream'}),
   byMarket(client,{deadline_state:'no_rule'}),byMarket(client,{period_end_estimated:true}),
-  list({disclosure_state:'overdue'},'due_date'),list({disclosure_state:'filed_not_ingested'},'due_date'),
-  list({disclosure_state:'pending'},'due_date',{gte:{due_date:today},lt:{due_date:addDaysIso(today,DUE_SOON_DAYS+1)}}),
-  list({disclosure_state:'unknown_upstream'},'period_end'),
+  list({disclosure_state:'overdue'}),list({disclosure_state:'filed_not_ingested'}),
+  list({disclosure_state:'pending'},{gte:{due_date:today},lt:{due_date:addDaysIso(today,DUE_SOON_DAYS+1)}}),
+  list({disclosure_state:'unknown_upstream'}),
   client.select('dq_filing_expectations',{...scope,deadline_state:'no_rule'},{orderBy:'period_end',desc:true,limit:CALENDAR_NO_RULE_MAX}),
  ]);
  const seen=new Set<string>();
  const rows=[...overdue,...filed,...soon,...unknown].filter(r=>{const k=rowKey(r);if(seen.has(k))return false;seen.add(k);return true;})
-  .sort((a,b)=>(RANK[String(a.disclosure_state)]??9)-(RANK[String(b.disclosure_state)]??9)||String(a.due_date??'9999').localeCompare(String(b.due_date??'9999'))||String(b.period_end).localeCompare(String(a.period_end)))
+  .sort((a,b)=>(RANK[String(a.disclosure_state)]??9)-(RANK[String(b.disclosure_state)]??9)||String(a.due_date??'9999').localeCompare(String(b.due_date??'9999'))||String(b.period_end).localeCompare(String(a.period_end))||rowKey(a).localeCompare(rowKey(b)))
   .slice(0,CALENDAR_ROWS_MAX);
  return {overdueByMarket,filedNotIngestedByMarket,unknownUpstreamByMarket,noRuleByMarket,estimatedByMarket,rows,noRuleRows};
 }
@@ -58,25 +68,19 @@ export async function loadClaimsBlock(client:TableClient):Promise<ClaimsBlock>{
  return {rows,total,securitiesByIssuer};
 }
 
-/** Distinct (pair, natural_key) whose LATEST row failed: out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count. */
-function failedDistinct(rows:Row[]):number{
- const latest=new Map<string,Row>();
- for(const r of rows){
-  const k=String(r.natural_key??r.id);
-  const cur=latest.get(k);
-  if(!cur||String(r.created_at??'')>String(cur.created_at??'')||(String(r.created_at??'')===String(cur.created_at??'')&&String(r.id)>String(cur.id)))latest.set(k,r);
- }
- return [...latest.values()].filter(r=>r.passed===false).length;
-}
+/**
+ * Failed count per pair = distinct natural keys whose LATEST row failed, aggregated in SQL (dq_reconcile_failed_counts):
+ * out-of-cycle recordReconciliation dedupe is best-effort (Task 14c), so raw row counts would double-count.
+ * Known limitation: a key that later leaves the sample keeps its last failed row in the count.
+ */
 export async function loadReconciliationsByPair(client:TableClient):Promise<ReconciliationsByPair>{
  const cyclePairs=new Set<string>(CYCLE_PAIR_IDS);
+ const counts=await callRpc(client,'dq_reconcile_failed_counts',{});
+ const failedBy=new Map<string,number>(Array.isArray(counts)?counts.map((r:Row)=>[String(r.pair),Number(r.failed)] as [string,number]):[]);
  const entries=await Promise.all(RECONCILE_PAIR_IDS.map(async pair=>{
-  const [rows,cycles]=await Promise.all([
-   selectAll(client,'dq_reconciliations',{pair},'id'),
-   cyclePairs.has(pair)?client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):Promise.resolve([] as Row[]),
-  ]);
+  const cycles=cyclePairs.has(pair)?await client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):[] as Row[];
   const c=cycles[0];
-  return [pair,{failed:failedDistinct(rows),lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
+  return [pair,{failed:failedBy.get(pair)??0,lastCycle:c?{cycle_id:String(c.cycle_id),status:String(c.status),finished_at:c.finished_at==null?null:String(c.finished_at)}:null}] as const;
  }));
  return Object.fromEntries(entries);
 }
diff --git a/src/lib/dq/dashboard.test.ts b/src/lib/dq/dashboard.test.ts
index 914bc4ff..43c8e1ea 100644
--- a/src/lib/dq/dashboard.test.ts
+++ b/src/lib/dq/dashboard.test.ts
@@ -1,5 +1,5 @@
 import {describe,it,expect} from 'vitest';
-import {dashboardDatasets,loadDqDashboard,parseDqQuery,summarizeDq,within} from './dashboard';
+import {RESTORABLE_CHECK_MAX,RESTORABLE_CONCURRENCY,dashboardDatasets,loadDqDashboard,parseDqQuery,summarizeDq,restorableOf,withRestorable,within} from './dashboard';
 import {DQ_DATASET_NAMES} from './datasets';
 import type {Row,SelectOptions,TableClient} from '../db/table-client';
 
@@ -87,6 +87,7 @@ describe('loadDqDashboard',()=>{
    insert:async()=>{throw new Error('read only');},
    update:async()=>{throw new Error('read only');},
    upsert:async()=>{throw new Error('read only');},
+   rpc:async(fn)=>{if(fn!=='dq_reconcile_failed_counts')throw new Error('read only');return [];},
    count:async(table,match)=>{calls.push({op:'count',table,match});return counts(table,match);},
    select:async(table,match,opts)=>{
     calls.push({op:'select',table,match,opts});
@@ -143,10 +144,47 @@ describe('loadDqDashboard',()=>{
   const now=new Date('2026-11-04T12:00:00Z');
   const withHash=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async item=>item.id==='q1'?'h':'x'});
   expect(withHash.quarantine.rows.map(r=>r.restorable)).toEqual([true,false,undefined]);
+  expect(withHash.quarantine.rows.map(r=>r.restorable_checked)).toEqual([true,true,undefined]);
   expect('restorable' in withHash.quarantine.rows[2]).toBe(false);
   const without=await loadDqDashboard(c2,{page:1,pageSize:50},now);
   expect(without.quarantine.rows.map(r=>r.restorable)).toEqual([false,false,undefined]);
+  expect(without.quarantine.rows.map(r=>r.restorable_checked)).toEqual([false,false,undefined]);
   const unavailable=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async()=>({unavailable:'inputs_unavailable'})});
   expect(unavailable.quarantine.rows[0].restorable).toBe(false);
  });
 });
+
+describe('withRestorable (bounded restore checks)',()=>{
+ const mk=(i:number,over:Row={}):Row=>({id:`q${i}`,dataset:'reconcile.x',natural_key:`k${i}`,reason_code:'reconcile_mismatch',detail:{latest_result:{passed:true,inputs_hash:'h'}},...over});
+ it('checks at most RESTORABLE_CHECK_MAX rows, the rest are unchecked and not restorable',async()=>{
+  const rows=Array.from({length:RESTORABLE_CHECK_MAX+5},(_,i)=>mk(i));
+  let calls=0;
+  const out=await withRestorable(rows,async()=>{calls++;return 'h';});
+  expect(calls).toBe(RESTORABLE_CHECK_MAX);
+  expect(out.slice(0,RESTORABLE_CHECK_MAX).every(r=>r.restorable===true&&r.restorable_checked===true)).toBe(true);
+  expect(out.slice(RESTORABLE_CHECK_MAX).every(r=>r.restorable===false&&r.restorable_checked===false)).toBe(true);
+ });
+ it('rows that cannot be restorable from the stored result do not use the check budget',async()=>{
+  const dead=Array.from({length:30},(_,i)=>mk(100+i,{detail:{latest_result:{passed:false,inputs_hash:'h'}}}));
+  let calls=0;
+  const out=await withRestorable([...dead,mk(1)],async()=>{calls++;return 'h';});
+  expect(calls).toBe(1);
+  expect(out[30]).toMatchObject({restorable:true,restorable_checked:true});
+  expect(out[0]).toMatchObject({restorable:false,restorable_checked:true});
+ });
+ it('memoises per (dataset, natural_key) and runs at most RESTORABLE_CONCURRENCY at once',async()=>{
+  const rows=[mk(1),mk(1,{id:'dupe'}),mk(2),mk(3),mk(4),mk(5),mk(6),mk(7)];
+  const seen:string[]=[];let active=0,peak=0;
+  const out=await withRestorable(rows,async item=>{seen.push(String(item.natural_key));active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return 'h';});
+  expect(seen.filter(k=>k==='k1')).toHaveLength(1);
+  expect(out.every(r=>r.restorable===true)).toBe(true);
+  expect(peak).toBeGreaterThan(1);expect(peak).toBeLessThanOrEqual(RESTORABLE_CONCURRENCY);
+ });
+ it('a throwing hash function, and a failed latest_result whose hash matches, are not restorable',async()=>{
+  expect(await restorableOf(mk(1),async()=>{throw new Error('boom');})).toBe(false);
+  expect((await withRestorable([mk(1)],async()=>{throw new Error('boom');}))[0]).toMatchObject({restorable:false,restorable_checked:true});
+  const failed=mk(2,{detail:{latest_result:{passed:false,inputs_hash:'h'}}});
+  expect(await restorableOf(failed,async()=>'h')).toBe(false);
+  expect((await withRestorable([failed],async()=>'h'))[0].restorable).toBe(false);
+ });
+});
diff --git a/src/lib/dq/dashboard.ts b/src/lib/dq/dashboard.ts
index 799aedbf..f2ffeb91 100644
--- a/src/lib/dq/dashboard.ts
+++ b/src/lib/dq/dashboard.ts
@@ -111,6 +111,39 @@ export async function restorableOf(row:Row,hashNow?:InputsHashNow):Promise<boole
  try{return (await hashNow(row))===latest.inputs_hash;}catch{return false;}
 }
 
+/** Live hash checks per dashboard load (the iXBRL pair refetches SEC primary documents) and how many run at once. */
+export const RESTORABLE_CHECK_MAX=25;
+export const RESTORABLE_CONCURRENCY=4;
+/**
+ * restorable / restorable_checked for each reconcile_mismatch row, bounded: rows that cannot be restorable from the stored
+ * result alone (no result, failed, no hash) are settled without a live check; at most RESTORABLE_CHECK_MAX of the others are
+ * checked (RESTORABLE_CONCURRENCY at a time, memoised per request by the item's (dataset, natural_key) which fixes the pair,
+ * key and left fact the hash depends on); the rest answer restorable:false, restorable_checked:false.
+ */
+export async function withRestorable(rows:Row[],hashNow?:InputsHashNow):Promise<Row[]>{
+ const out:Row[]=rows.map(r=>({...r}));
+ const todo:number[]=[];
+ rows.forEach((r,i)=>{
+  if(r.reason_code!=='reconcile_mismatch')return;
+  const latest=((r.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
+  if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string'){out[i].restorable=false;out[i].restorable_checked=!!hashNow;return;}
+  if(todo.length<RESTORABLE_CHECK_MAX)todo.push(i);else{out[i].restorable=false;out[i].restorable_checked=false;}
+ });
+ const memo=new Map<string,Promise<boolean>>();
+ let next=0;
+ const worker=async()=>{
+  for(;;){
+   const i=next++;if(i>=todo.length)return;
+   const r=rows[todo[i]];
+   const k=`${String(r.dataset)}\u0000${String(r.natural_key??r.id)}`;
+   let p=memo.get(k);if(!p){p=restorableOf(r,hashNow);memo.set(k,p);}
+   out[todo[i]].restorable=await p;out[todo[i]].restorable_checked=true;
+  }
+ };
+ await Promise.all(Array.from({length:Math.min(RESTORABLE_CONCURRENCY,todo.length)},worker));
+ return out;
+}
+
 /**
  * All dashboard reads. The open-quarantine KPI is a global count; the pager total is a
  * separate count filtered by the selected dataset, so filtering never changes the KPI.
@@ -144,7 +177,7 @@ export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date,
   batches24hTruncated:batches.length===DQ_RECENT_BATCHES&&batches24h.length===DQ_RECENT_BATCHES,
   batches,
   freshness,
-  quarantine:{rows:await Promise.all(quarantineRows.map(async r=>r.reason_code==='reconcile_mismatch'?{...r,restorable:await restorableOf(r,opts.inputsHashNow)}:r)),page,pageSize,total:quarantineTotal??openQuarantineTotal},
+  quarantine:{rows:await withRestorable(quarantineRows,opts.inputsHashNow),page,pageSize,total:quarantineTotal??openQuarantineTotal},
   reconciliations,
   calendar,claims,reconciliationsByPair,
   datasets:dashboardDatasets([...batches,...freshness,...quarantineRows].map(r=>r.dataset),dataset),
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 93d9a954..9dce98ab 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb,text)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb,text)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)','public.dq_reconcile_failed_counts()'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -1308,4 +1308,16 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   });
   expect((await secState(t)).isin).toBe(i1);
  });
+ it('dq_reconcile_failed_counts counts distinct natural keys by their latest row, per pair',async()=>{
+  const P1='test.'+randomBytes(4).toString('hex'),P2='test.'+randomBytes(4).toString('hex');
+  const ins=(pair:string,key:string,passed:boolean,at:string,id=randomUUID())=>q(`insert into public.dq_reconciliations(id,dataset,left_source,right_source,natural_key,tolerance,passed,pair,kind,outcome,detail,created_at) values($1,'reconcile.x','a','b',$2,0,$3,$4,'text','compared','{}',$5)`,[id,key,passed,pair,at]);
+  await ins(P1,'dup',false,'2026-11-01T00:00:00Z');await ins(P1,'dup',false,'2026-11-02T00:00:00Z');await ins(P1,'dup',false,'2026-11-03T00:00:00Z');
+  await ins(P1,'fixed',false,'2026-11-01T00:00:00Z');await ins(P1,'fixed',true,'2026-11-02T00:00:00Z');
+  await ins(P1,'other',false,'2026-11-01T00:00:00Z');
+  await ins(P1,'regressed',true,'2026-11-01T00:00:00Z');await ins(P1,'regressed',false,'2026-11-02T00:00:00Z');
+  await ins(P2,'tie',true,'2026-11-01T00:00:00Z','00000000-0000-4000-8000-000000000001');await ins(P2,'tie',false,'2026-11-01T00:00:00Z','00000000-0000-4000-8000-000000000002');
+  await ins(P2,'ok',true,'2026-11-01T00:00:00Z');
+  const got=Object.fromEntries((await q(`select pair, failed::int f from public.dq_reconcile_failed_counts() where pair in ($1,$2)`,[P1,P2])).map(r=>[r.pair,r.f]));
+  expect(got).toEqual({[P1]:3,[P2]:1});
+ });
 });
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 7ca40ce5..d81a63bb 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "2be8e59af64ec600d7844be8c48d6b1e192e02cbe17a63aea7e0b57c77f2ddf7"
+      "sha256": "4cdd923cf46b5a44639c0cb99a1d598cb8bf6f59a2ba94efc4d7b06ac6c29922"
     },
     {
       "file": "20261107091000_facts_extensions.sql",
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index a2858be6..a573c46a 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -1000,3 +1000,21 @@ end $$;
 drop trigger if exists issuers_topology_guard on public.issuers;
 create trigger issuers_topology_guard before insert or update of status, merged_into on public.issuers
   for each row execute function public.issuers_topology_guard();
+
+-- ---------------------------------------------------------------- dq_reconcile_failed_counts (admin dashboard, Task 19a review)
+-- Per pair, the number of DISTINCT natural keys whose LATEST row (created_at desc, id desc) failed.
+-- Out-of-cycle recordReconciliation dedupe is best-effort, so a raw count of failed rows would
+-- double-count a key. Known limitation: a key that later leaves the sample keeps its last failed row in the count.
+create index if not exists dq_reconciliations_pair_key_latest_idx
+  on public.dq_reconciliations(pair, natural_key, created_at desc, id desc);
+create or replace function public.dq_reconcile_failed_counts() returns table(pair text, failed bigint)
+language sql stable security definer set search_path = public as $$
+  select l.pair, count(*)::bigint
+    from (select distinct on (r.pair, r.natural_key) r.pair, r.passed
+            from public.dq_reconciliations r
+           order by r.pair, r.natural_key, r.created_at desc, r.id desc) l
+   where l.passed = false
+   group by l.pair
+$$;
+revoke execute on function public.dq_reconcile_failed_counts() from public, anon, authenticated;
+grant execute on function public.dq_reconcile_failed_counts() to service_role;

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; cat src/lib/db/table-client.ts; rg -n 'orderBy|nullsFirst|restorable_checked|inputsHashNow' src/lib/db src/lib/dq src/app | head -100; cat src/lib/dq/dashboard.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
// in-memory client and runs in production over the service-role Supabase client.
// PostgREST caps every response (max_rows, default 1000), so select() returns at most one
// page. Reads that may exceed one page must use selectAll(), which pages in a fixed order.
import type {SupabaseClient} from '@supabase/supabase-js';

export type Row=Record<string,unknown>;
/** Inclusive lower (`gte`) and exclusive upper (`lt`) bounds per column. ISO timestamp strings compare as text, numbers numerically. */
export interface RangeOptions{gte?:Record<string,string|number>;lt?:Record<string,string|number>}
// offset requires orderBy: unordered pages are not stable across requests.
// limit is an integer 1..MAX_PAGE; offset a non-negative safe integer.
export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}

/** Largest page PostgREST returns by default; also the limit and selectAll page-size ceiling. */
export const MAX_PAGE=1000;

/** Table operation failure; `code` is the PostgreSQL SQLSTATE when known (e.g. '23505' unique violation). */
export class TableError extends Error{
 readonly details?:string;
 readonly hint?:string;
 constructor(readonly op:string,readonly table:string,message:string,readonly code:string|null=null,extra:{details?:string|null;hint?:string|null;cause?:unknown}={}){
  super(`${table} ${op}: ${message}`,extra.cause===undefined?undefined:{cause:extra.cause});
  this.name='TableError';
  if(extra.details)this.details=extra.details;
  if(extra.hint)this.hint=extra.hint;
 }
}

export interface TableClient{
 insert(table:string,row:Row):Promise<Row>;
 /** Returns the number of rows the match hit. An empty match is rejected (no whole-table updates). */
 update(table:string,match:Row,patch:Row):Promise<number>;
 select(table:string,match:Row,opts?:SelectOptions):Promise<Row[]>;
 upsert(table:string,row:Row,onConflict:string):Promise<void>;
 count(table:string,match:Row,opts?:RangeOptions):Promise<number>;
 /**
  * Calls a service-role SQL function and returns its result (plan 3: the row-locking jsonb patches
  * append_claim_evidence / patch_quarantine_detail / set_security_identifier of migration 20261107090000). Optional so the landed
  * test stubs stay valid; callers go through callRpc, which fails loudly when it is missing.
  */
 rpc?(fn:string,args:Row):Promise<unknown>;
}

/** Calls `fn` through client.rpc. A client without rpc is a wiring error (rpc_unavailable:<fn>), never a silent no-op. */
export async function callRpc(client:TableClient,fn:string,args:Row):Promise<unknown>{
 if(!client.rpc)throw new Error(`rpc_unavailable:${fn}`);
 return client.rpc(fn,args);
}

/** Rejects `undefined` match values: they would otherwise be dropped or match nothing silently. */
export function assertMatch(match:Row):void{
 if(!match||typeof match!=='object')throw new Error('undefined_match_value');
 for(const v of Object.values(match))if(v===undefined)throw new Error('undefined_match_value');
}

export function assertUpdateMatch(match:Row):void{
 assertMatch(match);
 if(Object.keys(match).length===0)throw new Error('empty_update_match');
}

const okBound=(v:unknown)=>typeof v==='string'||(typeof v==='number'&&Number.isFinite(v));
function checkRange(opts:RangeOptions):void{
 for(const r of [opts.gte,opts.lt]){
  if(r===undefined)continue;
  if(!r||typeof r!=='object'||Object.values(r).some(v=>!okBound(v)))throw new Error('invalid_select_options');
 }
}

export function checkSelectOptions(opts:SelectOptions):void{
 if(opts.limit!==undefined&&(!Number.isSafeInteger(opts.limit)||opts.limit<1||opts.limit>MAX_PAGE))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&(!Number.isSafeInteger(opts.offset)||opts.offset<0))throw new Error('invalid_select_options');
 if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
 checkRange(opts);
}

export function checkRangeOptions(opts:RangeOptions):void{checkRange(opts);}

/**
 * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
 * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
 * unique column (ties make offset pages overlap or skip). Pages are separate requests, so the
 * result is not a snapshot: concurrent writes can be missed or seen twice.
 */
export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>MAX_PAGE)throw new Error(`selectAll pageSize must be 1..${MAX_PAGE}`);
 const out:Row[]=[];
 for(let offset=0;;){
  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
  if(page.length===0)return out;
  out.push(...page);offset+=page.length;
 }
}

// `.eq(k,null)` renders `k=eq.null`, which never matches in SQL; null must use `.is`.
const applyMatch=(q:any,match:Row)=>{for(const [k,v] of Object.entries(match))q=v===null?q.is(k,null):q.eq(k,v);return q;};
const applyRange=(q:any,opts:RangeOptions)=>{
 for(const [k,v] of Object.entries(opts.gte??{}))q=q.gte(k,v);
 for(const [k,v] of Object.entries(opts.lt??{}))q=q.lt(k,v);
 return q;
};

interface PgError{message:string;code?:string;details?:string|null;hint?:string|null}

export function supabaseTableClient(client:SupabaseClient):TableClient{
 // The hand-maintained Database type does describe the dq/issuer tables, but TableClient takes
 // table names as plain strings so the same callers run over the in-memory client too; the
 // loosely typed handle keeps that parity instead of casting at every call site.
 const db=client as unknown as {from:(t:string)=>any};
 const fail=(op:string,table:string,error:PgError):never=>{throw new TableError(op,table,error.message,error.code??null,{details:error.details,hint:error.hint,cause:error});};
 return {
  async insert(table,row){const {data,error}=await db.from(table).insert(row).select().single();if(error)fail('insert',table,error);return data as Row;},
  // Exact count from Content-Range; no rows are returned. A missing count fails closed.
  async update(table,match,patch){
   assertUpdateMatch(match);
   const {count,error}=await applyMatch(db.from(table).update(patch,{count:'exact'}),match);
   if(error)fail('update',table,error);
   if(count===null||count===undefined)throw new Error('update_count_unavailable');
   return count as number;
  },
  async select(table,match,opts={}){
   assertMatch(match);checkSelectOptions(opts);
   let q=applyRange(applyMatch(db.from(table).select('*'),match),opts);
   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
   if(opts.limit!==undefined||opts.offset!==undefined){const from=opts.offset??0;q=q.range(from,from+(opts.limit??MAX_PAGE)-1);}
   const {data,error}=await q;if(error)fail('select',table,error);return (data??[]) as Row[];
  },
  async upsert(table,row,onConflict){const {error}=await db.from(table).upsert(row,{onConflict});if(error)fail('upsert',table,error);},
  async count(table,match,opts={}){
   assertMatch(match);checkRangeOptions(opts);
   const {count,error}=await applyRange(applyMatch(db.from(table).select('*',{count:'exact',head:true}),match),opts);
   if(error)fail('count',table,error);
   if(count===null||count===undefined)throw new Error('count_unavailable');
   return count as number;
  },
  async rpc(fn,args){
   const {data,error}=await (client as unknown as {rpc:(f:string,a:Row)=>PromiseLike<{data:unknown;error:PgError|null}>}).rpc(fn,args);
   if(error)fail('rpc',fn,error);
   return data;
  },
 };
}
src/lib/db/table-client.ts:10:// offset requires orderBy: unordered pages are not stable across requests.
src/lib/db/table-client.ts:12:export interface SelectOptions extends RangeOptions{limit?:number;offset?:number;orderBy?:string;desc?:boolean}
src/lib/db/table-client.ts:72: if(opts.offset!==undefined&&!opts.orderBy)throw new Error('offset_requires_orderBy');
src/lib/db/table-client.ts:79: * Reads every matching row, paging by `offset` in `orderBy` order and stopping only on an empty
src/lib/db/table-client.ts:80: * page, so a server max_rows below pageSize cannot truncate the result. `orderBy` must be a
src/lib/db/table-client.ts:84:export async function selectAll(client:TableClient,table:string,match:Row,orderBy:string,pageSize=MAX_PAGE):Promise<Row[]>{
src/lib/db/table-client.ts:88:  const page=await client.select(table,match,{orderBy,offset,limit:pageSize});
src/lib/db/table-client.ts:123:   if(opts.orderBy)q=q.order(opts.orderBy,{ascending:!opts.desc});
src/lib/dq/dashboard-view.ts:52:  // server-computed (loadDqDashboard): passed AND latest inputs_hash === inputsHashNow(row)
src/lib/dq/dashboard.ts:118: * restorable / restorable_checked for each reconcile_mismatch row, bounded: rows that cannot be restorable from the stored
src/lib/dq/dashboard.ts:121: * key and left fact the hash depends on); the rest answer restorable:false, restorable_checked:false.
src/lib/dq/dashboard.ts:129:  if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string'){out[i].restorable=false;out[i].restorable_checked=!!hashNow;return;}
src/lib/dq/dashboard.ts:130:  if(todo.length<RESTORABLE_CHECK_MAX)todo.push(i);else{out[i].restorable=false;out[i].restorable_checked=false;}
src/lib/dq/dashboard.ts:140:   out[todo[i]].restorable=await p;out[todo[i]].restorable_checked=true;
src/lib/dq/dashboard.ts:151:export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date,opts:{inputsHashNow?:InputsHashNow}={}):Promise<DqDashboard>{
src/lib/dq/dashboard.ts:157:   client.select('ingest_batches',{},{orderBy:'started_at',desc:true,limit:DQ_RECENT_BATCHES}),
src/lib/dq/dashboard.ts:161:   client.select('dq_quarantine',pageMatch,{orderBy:'created_at',desc:true,limit:pageSize,offset:(page-1)*pageSize}),
src/lib/dq/dashboard.ts:163:   client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:DQ_RECENT_RECONCILIATIONS}),
src/lib/dq/dashboard.ts:180:  quarantine:{rows:await withRestorable(quarantineRows,opts.inputsHashNow),page,pageSize,total:quarantineTotal??openQuarantineTotal},
src/lib/db/table-client.test.ts:13:  expect((await c.select('t',{},{orderBy:'n',desc:true,limit:2})).map(r=>r.id)).toEqual(['c','a']);
src/lib/db/table-client.test.ts:53:  expect((await c.select('t',{},{orderBy:'n'})).map(r=>r.id)).toEqual(['c','a','b']);
src/lib/db/table-client.test.ts:54:  expect((await c.select('t',{},{orderBy:'n',desc:true})).map(r=>r.id)).toEqual(['b','a','c']);
src/lib/db/table-client.test.ts:96:   await expect(c.select('t',{},{orderBy:'id',limit})).rejects.toThrow('invalid_select_options');
src/lib/db/table-client.test.ts:98:   await expect(c.select('t',{},{orderBy:'id',offset})).rejects.toThrow('invalid_select_options');
src/lib/db/table-client.test.ts:99:  await expect(c.select('t',{},{orderBy:'id',offset:0,limit:MAX_PAGE})).resolves.toEqual([]);
src/lib/db/table-client.test.ts:109:  const got=await c.select('t',{},{gte:{at:'2026-11-03T00:00:00.000Z'},orderBy:'at'});
src/lib/db/table-client.test.ts:124:  expect((await c.select('t',{},{orderBy:'n',offset:1,limit:2})).map(r=>r.n)).toEqual([2,3]);
src/lib/db/table-client.test.ts:125:  expect((await c.select('t',{},{orderBy:'n',offset:3})).map(r=>r.n)).toEqual([4,5]);
src/lib/db/table-client.test.ts:127: it('rejects offset without orderBy',async()=>{
src/lib/db/table-client.test.ts:129:  await expect(c.select('t',{},{offset:1,limit:1})).rejects.toThrow('offset_requires_orderBy');
src/lib/db/table-client.test.ts:197:  await supabaseTableClient(ok.client).select('t',{},{gte:{at:'2026-11-01'},orderBy:'at',desc:true,limit:10});
src/lib/dq/dashboard-blocks.ts:39:  const first=await client.select('dq_filing_expectations',{...scope,...match},{orderBy:'due_date',limit:CALENDAR_ROWS_MAX,...extra});
src/lib/dq/dashboard-blocks.ts:42:  const tied=await client.select('dq_filing_expectations',{...scope,...match,due_date:edge},{orderBy:'period_end',desc:true,limit:CALENDAR_ROWS_MAX,...extra});
src/lib/dq/dashboard-blocks.ts:51:  client.select('dq_filing_expectations',{...scope,deadline_state:'no_rule'},{orderBy:'period_end',desc:true,limit:CALENDAR_NO_RULE_MAX}),
src/lib/dq/dashboard-blocks.ts:62:  client.select('issuer_identifier_claims',{status:'pending'},{orderBy:'created_at',desc:true,limit:CLAIMS_MAX}),
src/lib/dq/dashboard-blocks.ts:81:  const cycles=cyclePairs.has(pair)?await client.select('dq_reconcile_cycles',{pair},{orderBy:'started_at',desc:true,limit:1}):[] as Row[];
src/lib/dq/quarantine.ts:66: * order: the TableClient supports a single orderBy column, so `id` cannot be added as a tiebreaker.
src/lib/dq/quarantine.ts:72: return client.select(TABLE,match,{orderBy:'created_at',desc:true,limit});
src/lib/db/memory-table-client.ts:214:   if(opts.orderBy)out=[...out].sort(compare(opts.orderBy,!!opts.desc));
src/lib/db/pg-table-client.ts:5:// matched row count, select/count honour gte/lt ranges and orderBy/desc/limit/offset; rpc calls
src/lib/db/pg-table-client.ts:38: if(opts.orderBy)text+=` order by ${ident(opts.orderBy)} ${opts.desc?'desc':'asc'}`;
src/app/api/admin/dq/route.ts:22:      await loadDqDashboard(client, parsed.query, new Date(), { inputsHashNow: restoreInputsHashNow(admin) }),
src/lib/dq/facts-resolver.test.ts:280: it('reconcile_mismatch: without inputsHashNow → 409 not_passing + reconcile_wiring_missing (no write); {unavailable} → that note (inputs_unavailable / current_evidence_unavailable); with a hash → restoreReconciled(item, batch, hash) and materialize of the persisted target; promoted 0 → restore_note; not_passing → conflict',async()=>{
src/lib/dq/facts-resolver.test.ts:284:  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'inputs_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'inputs_unavailable'});
src/lib/dq/facts-resolver.test.ts:285:  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>({unavailable:'current_evidence_unavailable' as const})})).toEqual({outcome:'conflict',code:'not_passing',restoreNote:'current_evidence_unavailable'});
src/lib/dq/facts-resolver.test.ts:288:  const r=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf});
src/lib/dq/facts-resolver.test.ts:294:  const none=await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf});
src/lib/dq/facts-resolver.test.ts:298:  expect(await resolveFactsItem(db,tables,it_,{status:'resolved_accept',resolvedBy:ADMIN,now:NOW,inputsHashNow:hashOf})).toEqual({outcome:'conflict',code:'not_passing'});
src/lib/dq/facts-resolver.test.ts:367:   await resolveFactsItem(db,tables,a,{status:'resolved_accept',keepFactId:KEEP,resolvedBy:ADMIN,now:NOW,inputsHashNow:async()=>'h'});
src/lib/dq/facts-resolver.ts:11://  reconcile_mismatch → restore: inputsHashNow(item) is injected (the hash of the CURRENT inputs,
src/lib/dq/facts-resolver.ts:68: inputsHashNow?:InputsHashNow}
src/lib/dq/facts-resolver.ts:230: if(!input.inputsHashNow)return {outcome:'conflict',code:'not_passing',restoreNote:'reconcile_wiring_missing'};
src/lib/dq/facts-resolver.ts:231: const id=String(item.id);const hash=await input.inputsHashNow(item);
src/app/api/admin/dq/route.test.ts:64:    expect(load.mock.calls[0][3]).toEqual({ inputsHashNow: hashNow });
src/lib/dq/dashboard.test.ts:115:  expect(page?.opts).toMatchObject({limit:50,offset:50,orderBy:'created_at',desc:true});
src/lib/dq/dashboard.test.ts:145:  const withHash=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async item=>item.id==='q1'?'h':'x'});
src/lib/dq/dashboard.test.ts:147:  expect(withHash.quarantine.rows.map(r=>r.restorable_checked)).toEqual([true,true,undefined]);
src/lib/dq/dashboard.test.ts:151:  expect(without.quarantine.rows.map(r=>r.restorable_checked)).toEqual([false,false,undefined]);
src/lib/dq/dashboard.test.ts:152:  const unavailable=await loadDqDashboard(c2,{page:1,pageSize:50},now,{inputsHashNow:async()=>({unavailable:'inputs_unavailable'})});
src/lib/dq/dashboard.test.ts:164:  expect(out.slice(0,RESTORABLE_CHECK_MAX).every(r=>r.restorable===true&&r.restorable_checked===true)).toBe(true);
src/lib/dq/dashboard.test.ts:165:  expect(out.slice(RESTORABLE_CHECK_MAX).every(r=>r.restorable===false&&r.restorable_checked===false)).toBe(true);
src/lib/dq/dashboard.test.ts:172:  expect(out[30]).toMatchObject({restorable:true,restorable_checked:true});
src/lib/dq/dashboard.test.ts:173:  expect(out[0]).toMatchObject({restorable:false,restorable_checked:true});
src/lib/dq/dashboard.test.ts:185:  expect((await withRestorable([mk(1)],async()=>{throw new Error('boom');}))[0]).toMatchObject({restorable:false,restorable_checked:true});
src/app/api/admin/dq/quarantine/[id]/route.ts:111:          inputsHashNow: restoreInputsHashNow(admin),
src/lib/dq/reconcile/deps.ts:17:import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
src/lib/dq/reconcile/deps.ts:29:/** Data gaps of pairs.ts::inputsHashNow that mean "cannot restore now" (→ {unavailable:'inputs_unavailable'} → 409 not_passing / restorable=false), not a bug. */
src/lib/dq/reconcile/deps.ts:33: * (resolveFactsItem.inputsHashNow, Task 11) and the admin dashboard's server-computed `restorable` (Task 19a).
src/lib/dq/reconcile/deps.ts:41:  try{return await inputsHashNow(ctx,item);}
src/app/api/admin/dq/quarantine/[id]/route.test.ts:127:    expect(mocks.resolveFacts).toHaveBeenCalledWith({ facts: 'db' }, client, expect.objectContaining({ id: ID, dataset: 'facts.us' }), { status: 'resolved_accept', chosenFactIds: [FACT_A], resolvedBy: ADMIN, inputsHashNow: mocks.hashNow });
src/app/api/admin/dq/quarantine/[id]/route.test.ts:249:    expect(mocks.resolveFacts.mock.calls.at(-1)?.[3]).toMatchObject({ inputsHashNow: mocks.hashNow });
src/lib/dq/reconcile/pairs.test.ts:14:import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
src/lib/dq/reconcile/pairs.test.ts:279:describe('inputsHashNow (restore-side recomputation, spec §5.6)',()=>{
src/lib/dq/reconcile/pairs.test.ts:290:  expect(await inputsHashNow(ctx,item)).toBe(at(v1));
src/lib/dq/reconcile/pairs.test.ts:292:  expect(await inputsHashNow(ctx,item)).toBe(at(v2));                                     // changed evidence → a different hash
src/lib/dq/reconcile/pairs.test.ts:294:  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the entry is pending again
src/lib/dq/reconcile/pairs.test.ts:296:  await expect(inputsHashNow(ctx,item)).rejects.toThrow('current_evidence_unavailable');  // the key left the manifest
src/lib/dq/reconcile/pairs.test.ts:298:  await expect(inputsHashNow(ctx,{...item,detail:{pair:'us.companyfacts_vs_gold'}})).rejects.toThrow('no_latest_result');
src/lib/dq/reconcile/pairs.test.ts:299:  await expect(inputsHashNow(ctx,{...item,detail:{pair:'sec.filer_category',latest_result:{reconciliation_id:rec}}})).rejects.toThrow('pair_not_registered');
src/lib/dq/reconcile/pairs.test.ts:300:  await expect(inputsHashNow(ctx,{...item,payload:{fact_ids:[randomUUID()]}})).rejects.toThrow('left_fact_missing');
src/lib/dq/reconcile/pairs.ts:6:// deliberately absent. inputsHashNow recomputes a reconcile_mismatch item's inputs_hash from CURRENT
src/lib/dq/reconcile/pairs.ts:29:export async function inputsHashNow(ctx:PairContext,item:Row):Promise<string>{
src/lib/dq/reconcile/deps.test.ts:5:vi.mock('./pairs',async importOriginal=>({...(await importOriginal<typeof import('./pairs')>()),inputsHashNow:mocks.hash}));
src/lib/dq/reconcile/run.test.ts:34:const cursors=(t:TableClient)=>t.select(CURSOR_TABLE,{pair:PAIR},{orderBy:'issuer_id'});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:12:import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:72:  expect(await inputsHashNow(s.c,item)).toBe(res[2].inputs_hash);                     // same document, same sample → same hash
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:74:  const changed=await inputsHashNow(s.c,item);
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:78:  await expect(inputsHashNow(s.c,item)).rejects.toThrow('current_evidence_unavailable');
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:33:import {inputsHashNow} from './pairs';
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:185:  await expect(db.restoreReconciled(item.id,batchId,await inputsHashNow(pairCtx(),item),ADMIN)).rejects.toMatchObject({code:'not_passing'});
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:196:  const hashNow=await inputsHashNow(pairCtx(),item);
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:198:  const changed=await inputsHashNow(pairCtx({readRepoFile:async p=>p===US_SAMPLE_PATH?enc(`${new TextDecoder().decode(sampleBytes)} `):new Uint8Array(readFileSync(p))}),item);
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:204:  const docChanged=await inputsHashNow(pairCtx(),item);
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:208:  await expect(inputsHashNow(pairCtx(),item)).rejects.toThrow('current_evidence_unavailable');   // 404 now → restore stays disabled
src/lib/dq/reconcile/ixbrl-pair.integration.test.ts:210:  expect(await inputsHashNow(pairCtx(),item)).toBe(hashNow);
// View-model helpers for the /admin/dq dashboard. loadDqDashboard does the reads over a
// TableClient (stubbable in tests); the rest is pure shaping and query validation.
import type {Row,TableClient} from '../db/table-client';
import {DQ_DATASET_INVENTORY} from './datasets';
import type {Market} from '../facts/types';
import {freshnessOf} from './freshness';
import {loadCalendarBlock,loadClaimsBlock,loadReconciliationsByPair} from './dashboard-blocks';
import type {CalendarBlock,ClaimsBlock,ReconciliationsByPair} from './dashboard-blocks';
import type {InputsHashNow} from './facts-resolver';

export interface DqSummaryInput{
 batches:{dataset:string;status:string}[];
 freshness:{dataset:string;status:string;stored_status:string}[];
 /** Real total from count(), never the length of a page. */
 openQuarantineTotal:number;
 failedReconciliationsTotal:number;
}
export interface DqNotFresh{dataset:string;status:string;stored_status:string;drifted:boolean}
export interface DqSummary{
 batchesByStatus:Record<string,number>;
 freshnessTotal:number;
 notFresh:DqNotFresh[];
 notFreshByStatus:{stale:number;missing:number;error:number};
 openQuarantineTotal:number;
 failedReconciliationsTotal:number;
}

export function summarizeDq(input:DqSummaryInput):DqSummary{
 const batchesByStatus:Record<string,number>={};
 for(const b of input.batches)batchesByStatus[b.status]=(batchesByStatus[b.status]??0)+1;
 const notFreshByStatus={stale:0,missing:0,error:0};
 const notFresh:DqNotFresh[]=[];
 for(const f of input.freshness){
  if(f.status==='fresh')continue;
  notFresh.push({dataset:f.dataset,status:f.status,stored_status:f.stored_status,drifted:f.status!==f.stored_status});
  if(f.status==='stale'||f.status==='missing'||f.status==='error')notFreshByStatus[f.status]++;
 }
 return {
  batchesByStatus,freshnessTotal:input.freshness.length,notFresh,notFreshByStatus,
  openQuarantineTotal:input.openQuarantineTotal,failedReconciliationsTotal:input.failedReconciliationsTotal,
 };
}

/** Writer clocks may run slightly ahead of ours; rows up to this far in the future still count. */
export const CLOCK_SKEW_MS=60_000;

/** Rows whose `field` timestamp is within `ms` before `now` (+ CLOCK_SKEW_MS ahead); unparseable timestamps are excluded. */
export function within<T extends Record<string,unknown>>(rows:T[],field:string,now:Date,ms:number):T[]{
 const from=now.getTime()-ms,to=now.getTime()+CLOCK_SKEW_MS;
 return rows.filter(r=>{const t=Date.parse(String(r[field]??''));return Number.isFinite(t)&&t>=from&&t<=to;});
}

export const DQ_DEFAULT_PAGE_SIZE=50;
export const DQ_MAX_PAGE_SIZE=200;
// Used only as an equality filter (parameterised by PostgREST); the DB enforces length 1..64.
const DATASET_RE=/^[^\x00-\x1f\x7f]{1,64}$/u;
export type DqQuery={dataset?:string;page:number;pageSize:number;market?:Market};

const positiveInt=(raw:string|null,fallback:number):number|null=>{
 if(raw===null)return fallback;
 if(!/^[1-9][0-9]{0,6}$/.test(raw))return null;
 return Number(raw);
};

/** Validates dashboard query params; returns an error code instead of throwing. */
export function parseDqQuery(params:URLSearchParams):{ok:true;query:DqQuery}|{ok:false;error:string}{
 const page=positiveInt(params.get('page'),1);
 if(page===null)return {ok:false,error:'invalid_page'};
 const pageSize=positiveInt(params.get('pageSize'),DQ_DEFAULT_PAGE_SIZE);
 if(pageSize===null||pageSize>DQ_MAX_PAGE_SIZE)return {ok:false,error:'invalid_page_size'};
 const rawDataset=params.get('dataset');
 if(rawDataset!==null&&rawDataset!==''&&!DATASET_RE.test(rawDataset))return {ok:false,error:'invalid_dataset'};
 const markets=params.getAll('market');
 const rawMarket=markets[0]??null;
 if(markets.length>1||(rawMarket!==null&&rawMarket!==''&&rawMarket!=='US'&&rawMarket!=='CN'))return {ok:false,error:'invalid_market'};
 const market=rawMarket==='US'||rawMarket==='CN'?rawMarket:undefined;
 return {ok:true,query:{dataset:rawDataset?rawDataset:undefined,page,pageSize,...(market?{market}:{})}};
}

export const DQ_RECENT_BATCHES=50;
export const DQ_RECENT_RECONCILIATIONS=50;
const DAY_MS=86_400_000;

export interface DqDashboard{
 summary:DqSummary;
 batches24hTruncated:boolean;
 batches:Row[];
 freshness:Awaited<ReturnType<typeof freshnessOf>>;
 quarantine:{rows:Row[];page:number;pageSize:number;total:number};
 reconciliations:Row[];
 calendar:CalendarBlock;
 claims:ClaimsBlock;
 reconciliationsByPair:ReconciliationsByPair;
 /** Dataset filter options: the registry plus every dataset this response loaded (spec 3 §6.3, E9). */
 datasets:string[];
 refreshedAt:string;
}

/** Registry datasets ∪ loaded ones ∪ the current selection, unique and sorted (non-strings and '' are ignored). */
export function dashboardDatasets(loaded:Iterable<unknown>,selected?:string):string[]{
 const out=new Set<string>(DQ_DATASET_INVENTORY.map(e=>e.dataset));
 for(const d of loaded)if(typeof d==='string'&&d!=='')out.add(d);
 if(selected)out.add(selected);
 return [...out].sort();
}

/** Server-side restore eligibility of a reconcile_mismatch item (spec §7.2): passing latest_result AND its inputs_hash equals the CURRENT inputs hash (same function as the restore route; an {unavailable} answer is never equal → false). */
export async function restorableOf(row:Row,hashNow?:InputsHashNow):Promise<boolean>{
 const latest=((row.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
 if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string')return false;
 try{return (await hashNow(row))===latest.inputs_hash;}catch{return false;}
}

/** Live hash checks per dashboard load (the iXBRL pair refetches SEC primary documents) and how many run at once. */
export const RESTORABLE_CHECK_MAX=25;
export const RESTORABLE_CONCURRENCY=4;
/**
 * restorable / restorable_checked for each reconcile_mismatch row, bounded: rows that cannot be restorable from the stored
 * result alone (no result, failed, no hash) are settled without a live check; at most RESTORABLE_CHECK_MAX of the others are
 * checked (RESTORABLE_CONCURRENCY at a time, memoised per request by the item's (dataset, natural_key) which fixes the pair,
 * key and left fact the hash depends on); the rest answer restorable:false, restorable_checked:false.
 */
export async function withRestorable(rows:Row[],hashNow?:InputsHashNow):Promise<Row[]>{
 const out:Row[]=rows.map(r=>({...r}));
 const todo:number[]=[];
 rows.forEach((r,i)=>{
  if(r.reason_code!=='reconcile_mismatch')return;
  const latest=((r.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
  if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string'){out[i].restorable=false;out[i].restorable_checked=!!hashNow;return;}
  if(todo.length<RESTORABLE_CHECK_MAX)todo.push(i);else{out[i].restorable=false;out[i].restorable_checked=false;}
 });
 const memo=new Map<string,Promise<boolean>>();
 let next=0;
 const worker=async()=>{
  for(;;){
   const i=next++;if(i>=todo.length)return;
   const r=rows[todo[i]];
   const k=`${String(r.dataset)}\u0000${String(r.natural_key??r.id)}`;
   let p=memo.get(k);if(!p){p=restorableOf(r,hashNow);memo.set(k,p);}
   out[todo[i]].restorable=await p;out[todo[i]].restorable_checked=true;
  }
 };
 await Promise.all(Array.from({length:Math.min(RESTORABLE_CONCURRENCY,todo.length)},worker));
 return out;
}

/**
 * All dashboard reads. The open-quarantine KPI is a global count; the pager total is a
 * separate count filtered by the selected dataset, so filtering never changes the KPI.
 */
export async function loadDqDashboard(client:TableClient,query:DqQuery,now:Date,opts:{inputsHashNow?:InputsHashNow}={}):Promise<DqDashboard>{
 const {dataset,page,pageSize,market}=query;
 const openMatch:Row={status:'open'};
 const pageMatch:Row=dataset?{status:'open',dataset}:openMatch;
 const [batches,freshness,openQuarantineTotal,quarantineTotal,quarantineRows,failedReconciliationsTotal,reconciliations]=
  await Promise.all([
   client.select('ingest_batches',{},{orderBy:'started_at',desc:true,limit:DQ_RECENT_BATCHES}),
   freshnessOf(client,now),
   client.count('dq_quarantine',openMatch),
   dataset?client.count('dq_quarantine',pageMatch):null,
   client.select('dq_quarantine',pageMatch,{orderBy:'created_at',desc:true,limit:pageSize,offset:(page-1)*pageSize}),
   client.count('dq_reconciliations',{passed:false}),
   client.select('dq_reconciliations',{passed:false},{orderBy:'created_at',desc:true,limit:DQ_RECENT_RECONCILIATIONS}),
  ]);
 const [calendar,claims,reconciliationsByPair]=await Promise.all([loadCalendarBlock(client,market,now),loadClaimsBlock(client),loadReconciliationsByPair(client)]);
 const batches24h=within(batches,'started_at',now,DAY_MS);
 const summary=summarizeDq({
  batches:batches24h.map(b=>({dataset:String(b.dataset),status:String(b.status)})),
  freshness:freshness.map(f=>({dataset:String(f.dataset),status:f.status,stored_status:f.stored_status})),
  openQuarantineTotal,
  failedReconciliationsTotal,
 });
 return {
  summary,
  // The 24h tile is derived from the latest DQ_RECENT_BATCHES rows; if all of them fall in
  // the window there may be more, and the client shows the count as a lower bound.
  batches24hTruncated:batches.length===DQ_RECENT_BATCHES&&batches24h.length===DQ_RECENT_BATCHES,
  batches,
  freshness,
  quarantine:{rows:await withRestorable(quarantineRows,opts.inputsHashNow),page,pageSize,total:quarantineTotal??openQuarantineTotal},
  reconciliations,
  calendar,claims,reconciliationsByPair,
  datasets:dashboardDatasets([...batches,...freshness,...quarantineRows].map(r=>r.dataset),dataset),
  refreshedAt:now.toISOString(),
 };
}

exec
/bin/zsh -lc "cat src/lib/dq/dashboard-view.ts; rg -n 'pageSize|restorable|not_passing' src/components/admin* src/app/'[locale]'/admin/dq -g '*.tsx'; rg -n 'dq_quarantine.*unique|unique.*dq_quarantine|natural_key' supabase/migrations/202611* | head -25; cat src/lib/dq/reconcile/pairs.ts | head -65; ls -d node_modules 2>/dev/null; cat .codex/config.toml 2>/dev/null; rg -n 'pageSize|restorable' src/components | grep -i dq | head -40" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'}|{kind:'plain'};
const str=(v:unknown)=>v===null||v===undefined?'—':String(v);
export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown}):QuarantineControl{
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
zsh:1: no matches found: src/components/admin*
supabase/migrations/20261105090000_dq_foundation.sql:35:  natural_key  text not null check (length(natural_key) between 1 and 512),
supabase/migrations/20261105090000_dq_foundation.sql:52:create unique index if not exists dq_quarantine_open_key_uniq on public.dq_quarantine(dataset, table_name, natural_key, reason_code) where status = 'open';
supabase/migrations/20261105090000_dq_foundation.sql:60:  natural_key  text not null,
supabase/migrations/20261107091000_facts_extensions.sql:533:  v_nk_gen := substring(q.natural_key from ':([0-9]+)$')::int;
supabase/migrations/20261107091000_facts_extensions.sql:581:                  and d.natural_key = v_t::text || ':' || v_k || ':' || to_char(g.available_date, 'YYYY-MM-DD')) then
supabase/migrations/20261107091000_facts_extensions.sql:655:-- natural_key = <T>:<concept>:<period_start>:<period_end>:<consolidation>:<unit>:<available_date>.
supabase/migrations/20261107091000_facts_extensions.sql:676:  v_parts := string_to_array(q.natural_key, ':');
supabase/migrations/20261107091000_facts_extensions.sql:857:                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key = k))
supabase/migrations/20261107091000_facts_extensions.sql:859:                where r.pair = c.pair and r.cycle_id = c.cycle_id and r.issuer_id = c.issuer_id and r.market = c.market and r.natural_key <> all (v_keys)) then
supabase/migrations/20261107091000_facts_extensions.sql:884:-- fence check → (pair, cycle_id, natural_key) already accepted → that row is returned (reused,
supabase/migrations/20261107091000_facts_extensions.sql:889:--   item (reused by natural key <pair>:<natural_key>:<fact_id>) with payload {key, fact_ids,
supabase/migrations/20261107091000_facts_extensions.sql:910:     or coalesce(jsonb_typeof(p_result -> 'natural_key'), '') <> 'string'
supabase/migrations/20261107091000_facts_extensions.sql:919:  v_action := p_result ->> 'action'; v_nk := p_result ->> 'natural_key';
supabase/migrations/20261107091000_facts_extensions.sql:935:         and (coalesce(jsonb_typeof(p_result -> 'item'), '') <> 'object' or coalesce(jsonb_typeof(p_result -> 'item' -> 'natural_key'), '') <> 'string'
supabase/migrations/20261107091000_facts_extensions.sql:936:              or coalesce(jsonb_typeof(p_result -> 'item' -> 'payload'), '') <> 'object' or length(p_result -> 'item' ->> 'natural_key') not between 1 and 512)) then
supabase/migrations/20261107091000_facts_extensions.sql:945:  select * into v_existing from public.dq_reconciliations where pair = c.pair and cycle_id = c.cycle_id and natural_key = v_nk;
supabase/migrations/20261107091000_facts_extensions.sql:966:    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
supabase/migrations/20261107091000_facts_extensions.sql:970:      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
supabase/migrations/20261107091000_facts_extensions.sql:1003:    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
supabase/migrations/20261107091000_facts_extensions.sql:1005:    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
supabase/migrations/20261107091000_facts_extensions.sql:1008:      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
supabase/migrations/20261107091000_facts_extensions.sql:1009:      values (v_item, v_dataset, 'financial_facts', p_result -> 'item' ->> 'natural_key', v_reason,
supabase/migrations/20261107091000_facts_extensions.sql:1015:  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
supabase/migrations/20261107091000_facts_extensions.sql:1064:     -- natural keys are unique across the whole cycle: results are accepted per (pair, cycle, natural_key)
supabase/migrations/20261107090000_identifiers_and_dq.sql:108:create unique index if not exists dq_reconciliations_cycle_key on public.dq_reconciliations(pair, cycle_id, natural_key) where cycle_id is not null;
// src/lib/dq/reconcile/pairs.ts
// Registry of the cycle pairs run by run.ts (spec §5.1; contract C3). Task 14 registers
// facts.lineage_same_day and us.companyfacts_vs_gold; us.companyfacts_vs_ixbrl (Task 15); Task 16 adds
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
import {cnTushareVsGoldPair} from './pair-cn-gold';
import {lineageSameDayPair} from './pair-lineage';
import {sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import {usCompanyfactsVsGoldPair} from './pair-us-gold';
import {usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
import type {CyclePairId,PairContext} from './types';

export const RECONCILE_PAIRS:Partial<Record<CyclePairId,RegisteredPair>>={
 'facts.lineage_same_day':lineageSameDayPair(),
 'us.companyfacts_vs_gold':usCompanyfactsVsGoldPair(),
 'us.companyfacts_vs_ixbrl':usCompanyfactsVsIxbrlPair(),
 'cn.tushare_vs_cninfo_pdf_gold':cnTushareVsGoldPair(),
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
node_modules

exec
/bin/zsh -lc "rg -n 'pageSize|quarantineControl|control.enabled|disabled|restore' src/app | grep -E 'dq/.*tsx' | head -45; git log -3 --oneline; nl -ba src/lib/dq/dashboard.ts | sed -n '124,134p'; ls node_modules/.bin/vitest; cat package.json | grep -A15 scripts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/app/(app)/admin/dq/AdminDqClient.tsx:14:  quarantine: { rows: Row[]; page: number; pageSize: number; total: number };
src/app/(app)/admin/dq/AdminDqClient.tsx:96:        const lastPage = Math.max(1, Math.ceil(d.quarantine.total / d.quarantine.pageSize));
src/app/(app)/admin/dq/AdminDqClient.tsx:130:  const pages = q ? Math.max(1, Math.ceil(q.total / q.pageSize)) : 1;
src/app/(app)/admin/dq/AdminDqClient.tsx:150:          <button type="button" onClick={reload} disabled={busy} className="min-h-9 rounded-md border border-border bg-bg-elevated px-3 text-xs hover:text-accent disabled:opacity-50">{loading ? t('loading') : t('refresh')}</button>
src/app/(app)/admin/dq/AdminDqClient.tsx:198:            <select value={dataset} disabled={pending !== null} onChange={(e) => { setDataset(e.target.value); setPage(1); }} className="min-h-9 rounded-md border border-border bg-bg-card px-2 font-mono text-text">
src/app/(app)/admin/dq/AdminDqClient.tsx:205:            <button type="button" disabled={busy || page <= 1} onClick={() => setPage((p) => p - 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('prev')}</button>
src/app/(app)/admin/dq/AdminDqClient.tsx:206:            <button type="button" disabled={busy || page >= pages} onClick={() => setPage((p) => p + 1)} className="min-h-9 rounded-md border border-border px-2 disabled:opacity-40">{t('next')}</button>
src/app/(app)/admin/dq/AdminDqClient.tsx:245:    const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
src/app/(app)/admin/dq/AdminDqClient.tsx:248:        <button type="button" disabled={busy} aria-label={`${t('accept')} ${key}`} onClick={() => resolve(id, 'resolved_accept')} className={`${btn} text-accent`}>{t('accept')}</button>
src/app/(app)/admin/dq/AdminDqClient.tsx:249:        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, 'resolved_reject')} className={`${btn} text-danger`}>{t('reject')}</button>
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-aPcO6C6E' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UwiqBuMu' (errno=Operation not permitted)
c27481a5 docs(plan): alignment #74 SQL-side per-pair failure counts and bounded restorable checks
3afa741e fix(admin/dq): SQL-aggregated distinct-key failure counts, bounded restorable checks, due-date ordering before the calendar limit
363f207b feat(dq): CN_DISCLOSURE_VERIFIED=true after real Tushare disclosure_date check
   124	 const out:Row[]=rows.map(r=>({...r}));
   125	 const todo:number[]=[];
   126	 rows.forEach((r,i)=>{
   127	  if(r.reason_code!=='reconcile_mismatch')return;
   128	  const latest=((r.detail??{}) as {latest_result?:{passed?:unknown;inputs_hash?:unknown}}).latest_result;
   129	  if(!hashNow||latest?.passed!==true||typeof latest.inputs_hash!=='string'){out[i].restorable=false;out[i].restorable_checked=!!hashNow;return;}
   130	  if(todo.length<RESTORABLE_CHECK_MAX)todo.push(i);else{out[i].restorable=false;out[i].restorable_checked=false;}
   131	 });
   132	 const memo=new Map<string,Promise<boolean>>();
   133	 let next=0;
   134	 const worker=async()=>{
node_modules/.bin/vitest
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

exec
/bin/zsh -lc "rg -n 'quarantineControl|inputs_changed|c.enabled' src | head -25; sed -n '70,88p' 'src/app/(app)/admin/dq/AdminDqClient.tsx'; sed -n '90,115p' supabase/migrations/20261107090000_identifiers_and_dq.sql" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/dq/dashboard-view.ts:38:export type QuarantineControl={kind:'candidates';options:{index:number;label:string}[]}|{kind:'lineage';options:{factId:string;label:string}[]}|{kind:'restore';enabled:boolean;reason:'passing'|'not_passing'|'no_result'|'inputs_changed'}|{kind:'plain'};
src/lib/dq/dashboard-view.ts:40:export function quarantineControl(row:{reason_code?:unknown;payload?:unknown;detail?:unknown;restorable?:unknown}):QuarantineControl{
src/lib/dq/dashboard-view.ts:53:  return row.restorable===true?{kind:'restore',enabled:true,reason:'passing'}:{kind:'restore',enabled:false,reason:'inputs_changed'};
src/lib/dq/dashboard-view.ts:61: if(c.kind==='restore'&&!c.enabled)return null;
src/lib/dq/dashboard-view.test.ts:3:import {amendBody,claimMode,disclosureTone,overdueDays,quarantineAcceptBody,quarantineControl,suggestedOp,sumByMarket} from './dashboard-view';
src/lib/dq/dashboard-view.test.ts:32:  const c=quarantineControl({reason_code:'ambiguous_value',payload:{candidates:[{value:'100',unit:'USD',sourceConcept:'Revenues',filingRef:'acc-1'},{value:'101',unit:'USD',sourceConcept:'SalesRevenueNet',filingRef:'acc-1'}]}});
src/lib/dq/dashboard-view.test.ts:38:  const c=quarantineControl({reason_code:'lineage_conflict',payload:{fact_ids:['f1','f2'],values:[{issuer_id:'A',filing:'x',value:'1'},{fact_id:'f2',issuer_id:'B',filing:'y',value:'2'}]}});
src/lib/dq/dashboard-view.test.ts:44:  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:true,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:true,reason:'passing'});
src/lib/dq/dashboard-view.test.ts:45:  expect(quarantineControl({reason_code:'reconcile_mismatch',restorable:false,detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
src/lib/dq/dashboard-view.test.ts:46:  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:true}}})).toEqual({kind:'restore',enabled:false,reason:'inputs_changed'});
src/lib/dq/dashboard-view.test.ts:47:  const off=quarantineControl({reason_code:'reconcile_mismatch',detail:{latest_result:{passed:false}}});
src/lib/dq/dashboard-view.test.ts:50:  expect(quarantineControl({reason_code:'reconcile_mismatch',detail:{}})).toEqual({kind:'restore',enabled:false,reason:'no_result'});
src/lib/dq/dashboard-view.test.ts:51:  expect(quarantineControl({reason_code:'same_day_conflict'})).toEqual({kind:'plain'});
src/lib/research/runtime/item-routes.test.ts:18:it.each([undefined,'1'])('production item routes remain disabled before connection with enabled=%s',async enabled=>{
const td = 'whitespace-nowrap px-2 py-1.5';
const num = `${td} text-right tabular-nums`;

export function AdminDqClient() {
  const t = useTranslations('admin.dq');
  const locale = useLocale();
  const [dataset, setDataset] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DqResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const qs = new URLSearchParams({ page: String(page) });
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

exec
/bin/zsh -lc "sed -n '215,260p' 'src/app/(app)/admin/dq/AdminDqClient.tsx'; rg -n 'restorable|quarantineControl' --glob '*.tsx' . | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
            {(q?.rows ?? []).map((r) => (
              <tr key={String(r.id)} className={pending === String(r.id) ? 'opacity-50' : undefined}>
                <td className={td}>{time(r.created_at)}</td><td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.table_name)}</td>
                <td className={`${td} font-mono`}>{s(r.natural_key)}</td><td className={td}>{s(r.reason_code)}</td>
                <td className="max-w-[16rem] px-2 py-1.5 align-top"><Detail value={r.detail} /></td>
                <td className={td}>{actions(r)}</td>
              </tr>
            ))}
          </Table>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">{t('notes.quarantine')}</p>
      </Panel>

      <Panel title={recTitle}>
        <Table empty={t('empty')} head={[{ label: t('columns.dataset') }, { label: t('columns.naturalKey') }, { label: t('columns.leftSource') }, { label: t('columns.leftValue'), num: true }, { label: t('columns.rightSource') }, { label: t('columns.rightValue'), num: true }, { label: t('columns.relDiff'), num: true }, { label: t('columns.tolerance'), num: true }]}>
          {(data?.reconciliations ?? []).map((r) => (
            <tr key={String(r.id)}>
              <td className={`${td} font-mono`}>{s(r.dataset)}</td><td className={`${td} font-mono`}>{s(r.natural_key)}</td>
              <td className={td}>{s(r.left_source)}</td><td className={num}>{s(r.left_value)}</td><td className={td}>{s(r.right_source)}</td><td className={num}>{s(r.right_value)}</td>
              <td className={`${num} ${r.passed === false ? 'text-danger' : ''}`}>{pct(r.rel_diff)}</td><td className={num}>{pct(r.tolerance)}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </div>
  );

  function actions(row: Row) {
    const id = String(row.id);
    const key = s(row.natural_key);
    const btn = 'min-h-9 rounded-md border border-border px-3 disabled:opacity-40';
    return (
      <div className="flex gap-2">
        <button type="button" disabled={busy} aria-label={`${t('accept')} ${key}`} onClick={() => resolve(id, 'resolved_accept')} className={`${btn} text-accent`}>{t('accept')}</button>
        <button type="button" disabled={busy} aria-label={`${t('reject')} ${key}`} onClick={() => resolve(id, 'resolved_reject')} className={`${btn} text-danger`}>{t('reject')}</button>
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

codex
No actionable regressions were identified in the SQL aggregation, bounded restore checks, or calendar ordering changes. The added tests cover the principal changed behaviors; tests were not executed during this review.
No actionable regressions were identified in the SQL aggregation, bounded restore checks, or calendar ordering changes. The added tests cover the principal changed behaviors; tests were not executed during this review.

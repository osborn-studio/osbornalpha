OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b026-4fb0-7843-ae6d-83af67a77815
--------
user
commit 27d503e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 27d503e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 268ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-T8UgR2zt' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-azlDwHjb' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-R4N0wOjA' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rGUD6v5e' (errno=Operation not permitted)
27d503e feat(entities): load-sec ticker-change detection (pending_change, 7-day/new-hash/submissions-confirmed close, snapshot gating); atomic patch_security_provenance and set_security_window p_to_method
 scripts/entity-keys/load-sec-issuers.ts            | 117 ++++++++++-------
 src/lib/db/memory-table-client.ts                  |  24 +++-
 src/lib/entities/identifiers.integration.test.ts   |  38 +++++-
 src/lib/entities/load-sec-ticker-change.test.ts    | 124 ++++++++++++++++++
 src/lib/entities/load-sec.ts                       | 142 ++++++++++++++++++++-
 supabase/migrations.lock.json                      |   2 +-
 .../20261107090000_identifiers_and_dq.sql          |  42 +++++-
 7 files changed, 425 insertions(+), 64 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md AGENTS.md CLAUDE.md; do if test -f "$p"; then echo ==== $p; cat "$p"; fi; done; git show 27d503e --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md AGENTS.md CLAUDE.md; do if test -f "$p"; then printf '"'\\n==== %s\\n' \""'$p"; cat "$p"; fi; done; git show 27d503e --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

==== /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-clESjWHE' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hZYfh8s1' (errno=Operation not permitted)
commit 27d503efd42c7e616e9843e7e6788be1081fcad7
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:17:29 2026 -0800

    feat(entities): load-sec ticker-change detection (pending_change, 7-day/new-hash/submissions-confirmed close, snapshot gating); atomic patch_security_provenance and set_security_window p_to_method
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/load-sec-issuers.ts b/scripts/entity-keys/load-sec-issuers.ts
index d05f5f1..dbd6f8f 100644
--- a/scripts/entity-keys/load-sec-issuers.ts
+++ b/scripts/entity-keys/load-sec-issuers.ts
@@ -1,82 +1,105 @@
 /**
- * Load US issuers (by CIK) and their listed tickers from SEC company_tickers_exchange.json,
- * restricted to tickers present in stocks_universe (market='US').
- *
- *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]
- *
- * Download separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
- * Without --apply this is a dry run: it prints the plan summary and writes nothing (no ingest batch).
- * With --apply it records an ingest_batches receipt (dataset entities.sec) and a freshness attempt.
- * Exit 1 when the batch failed (an empty plan included), any row failed or any input row was
- * rejected as invalid (rejected_summary); 2 on bad arguments.
- *
- * tsx does NOT load .env.local. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by
- * exporting them, or run: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
- * Both the universe read (dry run included) and --apply need them.
+ * Load US issuers and listed securities from SEC company_tickers_exchange.json, then run
+ * ticker-change detection (spec 3 §4.3.4).
+ *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]
+ * Download the file separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
+ * and pass the download instant as --fetched-at (required with --apply; written to tool_versions with the
+ * file sha256 and data row count).
+ * --apply refuses (exit 1, no batch) when as_of or fetched_at is older than the last successful batch
+ * (stale_snapshot) or the file has fewer than 90% of its data rows (incomplete_snapshot).
+ * Without --apply this is a dry run: prints the plan and the snapshot check, writes nothing.
+ * Closing a vanished ticker needs the CIK's SEC submissions (second source): fetched live and stored in
+ * reconcile-raw (EDGAR_USER_AGENT, else DEFAULT_USER_AGENT).
+ * Exit 1 when the batch failed, any row failed or any input row was rejected; 2 on bad arguments.
+ * tsx does NOT load .env.local: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
  */
+import {createHash} from 'node:crypto';
 import {readFileSync,statSync} from 'node:fs';
-import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
-import type {TableClient} from '../../src/lib/db/table-client';
-import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
-import type {BatchError,BatchStatus} from '../../src/lib/dq/batches';
+import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
 import {recordAttempt} from '../../src/lib/dq/freshness';
-import {applySecLoad,errorMessage,loaderOutcome,planSecLoad} from '../../src/lib/entities/load-sec';
-import {DATASETS,inventoryEntry} from '../../src/lib/dq/datasets';
+import {supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
+import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,loaderOutcome,planSecLoad,snapshotMetaOf,type SnapshotMeta} from '../../src/lib/entities/load-sec';
 import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
-const DATASET=DATASETS.entities.sec;
-const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--apply] [--as-of YYYY-MM-DD]';
+const DATASET=SEC_DATASET;
+const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]';
 
 /** A YYYY-MM-DD that names a real calendar day (2026-02-30 is rejected). */
 const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const d=new Date(`${s}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;})();
+/** An ISO-8601 instant with an explicit zone (Z or ±hh:mm). */
+const isInstant=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
 
-function parseArgs(argv:string[]):{file:string;apply:boolean;asOf:string}{
- let file:string|undefined,apply=false,asOf=new Date().toISOString().slice(0,10);
+function parseArgs(argv:string[]):{file:string;apply:boolean;asOf:string;fetchedAt:string|null}{
+ let file:string|undefined,apply=false,asOf=new Date().toISOString().slice(0,10),fetchedAt:string|null=null;
  for(let i=0;i<argv.length;i++){
   const a=argv[i];
   if(a==='--apply')apply=true;
-  else if(a==='--as-of'){asOf=argv[++i]??'';}
+  else if(a==='--as-of')asOf=argv[++i]??'';
+  else if(a==='--fetched-at')fetchedAt=argv[++i]??'';
   else if(a.startsWith('--')){console.error(USAGE);process.exit(2);}
   else if(!file)file=a;
   else{console.error(USAGE);process.exit(2);}
  }
- if(!file||!isCalendarDate(asOf)){console.error(USAGE);process.exit(2);}
- return {file,apply,asOf};
+ if(!file||!isCalendarDate(asOf)||(fetchedAt!==null&&!isInstant(fetchedAt))||(apply&&fetchedAt===null)){console.error(USAGE);process.exit(2);}
+ return {file,apply,asOf,fetchedAt};
 }
 
 async function loadPlan(client:TableClient,file:string,asOf:string){
  if(statSync(file).size>MAX_SEC_FILE_BYTES)throw new Error('file_too_large');
- const parsed=parseSecCompanyTickersExchange(readFileSync(file,'utf8'));
+ const bytes=readFileSync(file);
+ const parsed=parseSecCompanyTickersExchange(bytes.toString('utf8'));
  const universeRows=await selectAll(client,'stocks_universe',{market:'US'},'ticker');
  const universe=new Set(universeRows.map(r=>String(r.ticker)));
- return {parsed,universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
+ return {parsed,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
 }
 
-async function dryRun(client:TableClient,file:string,asOf:string){
- const {parsed,universeSize,plan}=await loadPlan(client,file,asOf);
+/** Successful (success/partial) entities.sec receipts, newest first. */
+async function priorSnapshots(client:TableClient):Promise<SnapshotMeta[]>{
+ const rows:Row[]=[];
+ for(const status of ['success','partial'])rows.push(...await client.select('ingest_batches',{dataset:DATASET,status},{orderBy:'started_at',desc:true,limit:50}));
+ return rows.sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at))).map(snapshotMetaOf).filter((m):m is SnapshotMeta=>m!==null);
+}
+
+async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:string|null){
+ const {parsed,sha256,universeSize,plan}=await loadPlan(client,file,asOf);
+ const prev=(await priorSnapshots(client))[0]??null;
+ const rows=parsed.rows.length+parsed.rejected.length;
  console.log(JSON.stringify({
-  mode:'dry-run (no ingest batch written; pass --apply to write)',asOf,
+  mode:'dry-run (no ingest batch written; pass --apply --fetched-at <ISO> to write)',asOf,sha256,rows,
+  snapshotCheck:fetchedAt?checkSnapshot(prev,{as_of:asOf,fetched_at:fetchedAt,rows}):'needs --fetched-at',previous:prev,
   parsed:parsed.rows.length,rejected:parsed.rejected.length,universe:universeSize,
   issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,
   firstSkipped:plan.skipped.slice(0,10),firstRejected:parsed.rejected.slice(0,10),
  },null,1));
 }
 
-async function apply(client:TableClient,file:string,asOf:string):Promise<0|1>{
- // The batch starts before reading the file so a malformed or oversized file still leaves a failed receipt.
- const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf}});
- let counts=emptyCounts();
+const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};
+
+async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
+ const {parsed,sha256,plan}=await loadPlan(client,file,asOf);
+ const rows=parsed.rows.length+parsed.rejected.length;
+ const prior=await priorSnapshots(client);
+ const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
+ if(check!=='ok'){console.error(JSON.stringify({refused:check,asOf,fetchedAt,rows,previous:prior[0]}));return 1;}
+ const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows)}});
+ const counts=emptyCounts();
  let errors:BatchError[]=[];
- let skipped:Record<string,number>={};
  let rejected:Record<string,number>={};
  let status:BatchStatus='failed';
  try{
-  const {parsed,plan}=await loadPlan(client,file,asOf);
-  const result=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:parsed.rows.length+parsed.rejected.length,rejected:parsed.rejected}});
-  ({counts,errors}=result);
-  skipped=result.skippedSummary;
-  rejected=result.rejectedSummary;
+  const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
+  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;
+  const raw=supabaseRawStore(getAdminSupabase());
+  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId},{
+   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256};}catch{return null;}},
+   lastSeenAsOf:async before=>prior.map(p=>p.as_of).filter(d=>d<before).sort().at(-1)??null,
+  });
+  // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
+  changes.counts.fetched=0;
+  add(counts,changes.counts);errors=[...errors,...changes.errors];
  }catch(e){
   errors=[...errors,{code:'exception',message:errorMessage(e)}];
  }finally{
@@ -84,16 +107,16 @@ async function apply(client:TableClient,file:string,asOf:string):Promise<0|1>{
   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
  }
  const outcome=loaderOutcome(status,counts,rejected);
- await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:inventoryEntry(DATASET).cadence});
- console.log(JSON.stringify({batchId,status,counts,skipped,rejected,errors:errors.slice(0,20)},null,1));
+ await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
+ console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
  return outcome.exitCode;
 }
 
 async function main(){
- const {file,apply:doApply,asOf}=parseArgs(process.argv.slice(2));
+ const {file,apply:doApply,asOf,fetchedAt}=parseArgs(process.argv.slice(2));
  const client=supabaseTableClient(getAdminSupabase());
- if(!doApply){await dryRun(client,file,asOf);return;}
- process.exitCode=await apply(client,file,asOf);
+ if(!doApply){await dryRun(client,file,asOf,fetchedAt);return;}
+ process.exitCode=await apply(client,file,asOf,fetchedAt!);
 }
 
 main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 2c99cbf..b4af5be 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,7 +8,7 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
-//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window); one synchronous JS turn stands for the row lock.
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance); one synchronous JS turn stands for the row lock.
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -75,8 +75,8 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
  },
  // Task 5a: guarded evidenced-window write (date + method + one provenance key). Not mirrored: claim_provenance_safe and the no-overlap exclusion (DB suite).
  set_security_window(rowsOf,a){
-  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date;
-  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv))
+  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date,tm=a.p_to_method===undefined?'delisting':a.p_to_method;
+  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)||(side==='to'&&tm!=='delisting'&&tm!=='sec_file_absent'))
    throw new TableError('rpc','set_security_window','invalid_window_write','22023');
   if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
   const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
@@ -88,13 +88,27 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
    if(rowsOf('issuer_securities').some(o=>o!==row&&o.ticker===a.p_ticker&&String(o.valid_from)<String(row.valid_from)))return 'conflict';   // not the ticker's earliest row
    row.valid_from=nd;row.valid_from_method='listing_date';
   }else{
-   if(row.valid_to===nd&&row.valid_to_method==='delisting'&&'valid_to' in prov)return 'duplicate';
+   if(row.valid_to===nd&&row.valid_to_method===tm&&'valid_to' in prov)return 'duplicate';
    if(row.valid_to!=null||nd<=String(row.valid_from))return 'conflict';
-   row.valid_to=nd;row.valid_to_method='delisting';
+   row.valid_to=nd;row.valid_to_method=tm;
   }
   row.provenance={...prov,...clone(pv)};
   return 'written';
  },
+ // Task 6b: the only writer of provenance.pending_change; open rows only. claim_provenance_safe is not mirrored (DB suite).
+ patch_security_provenance(rowsOf,a){
+  const set=a.p_set,rm=a.p_remove;
+  if(!isObj(set)||Object.keys(set).some(k=>k!=='pending_change')||!Array.isArray(rm)||rm.some(k=>k!=='pending_change'))
+   throw new TableError('rpc','patch_security_provenance','invalid_provenance_patch','22023');
+  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
+  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from&&r.valid_to==null);
+  if(!row)return 'not_found';
+  const prov=isObj(row.provenance)?row.provenance:{};
+  const next:Row={...prov};for(const k of rm)delete next[k];Object.assign(next,clone(set));
+  if(JSON.stringify(Object.entries(next).sort())===JSON.stringify(Object.entries(prov).sort()))return 'duplicate';
+  row.provenance=next;
+  return 'written';
+ },
  set_security_identifier(rowsOf,a){
   const col=a.p_column,v=a.p_value,pv=a.p_provenance;
   if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 508401f..ea9c565 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb,text)','public.patch_security_provenance(uuid,text,date,jsonb,text[])'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -1027,8 +1027,8 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
  });
 
  // Task 5a: evidenced window writes land date + method + one provenance key in one locked UPDATE.
- const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin)=>
-  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb) v`,[a,t,from,side,date,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
+ const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin,toMethod?:string)=>
+  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb${toMethod?',$7':''}) v`,[a,t,from,side,date,JSON.stringify(prov),...(toMethod?[toMethod]:[])]).then(r=>r.rows[0].v as string);
  const winState=async(t:string)=>(await q(`select to_char(valid_from,'YYYY-MM-DD') valid_from,to_char(valid_to,'YYYY-MM-DD') valid_to,valid_from_method,valid_to_method,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
  const WF={valid_from:{source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{list_date:'2001-08-27'}}};
  const WT={valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{delist_date:'2026-06-30'}}};
@@ -1055,6 +1055,38 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
    ()=>setWin(a,t,'2001-08-27','from','2000-01-01',{valid_from:{url:'https://a.example/p?token=1'}}),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{isin:{}})])
    expect(await fails(bad())).toMatchObject({message:'invalid_window_write',code:'22023'});
  });
+ const patchProv=(a:string,t:string,from:string,set:unknown,remove:string[],on:Pool|PoolClient=admin)=>
+  on.query(`select public.patch_security_provenance($1,$2,$3::date,$4::jsonb,$5::text[]) v`,[a,t,from,JSON.stringify(set),remove]).then(r=>r.rows[0].v as string);
+ const PC={pending_change:{first_missing_as_of:'2026-11-02',first_missing_sha256:'a'.repeat(64),first_missing_fetched_at:'2026-11-02T06:00:00.000Z',replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']}};
+ it('patch_security_provenance: written / duplicate / not_found / invalid; set and remove only pending_change; closed rows are not found; sec_file_absent close keeps pending_change',async()=>{
+  const a=await issuer();const t=await ticker();
+  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
+  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('written');
+  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('duplicate');
+  expect((await winState(t)).provenance).toEqual({exchange:'Nasdaq',...PC});
+  expect(await setWin(a,t,'2024-03-01','to','2024-11-02',{valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}},admin,'sec_file_absent')).toBe('written');
+  expect(await winState(t)).toMatchObject({valid_to:'2024-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}}});
+  expect(await patchProv(a,t,'2024-03-01',{},['pending_change'])).toBe('not_found');   // closed
+  const u=await ticker();
+  await sec(a,u,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
+  await patchProv(a,u,'2024-03-01',PC,[]);
+  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('written');
+  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('duplicate');
+  expect((await winState(u)).provenance).toEqual({exchange:'Nasdaq'});
+  expect(await patchProv(a,await ticker(),'2024-03-01',PC,[])).toBe('not_found');
+  expect(await patchProv(randomUUID(),u,'2024-03-01',PC,[])).toBe('not_found');
+  for(const bad of [()=>patchProv(a,u,'2024-03-01',{isin:'x'},[]),()=>patchProv(a,u,'2024-03-01',{},['exchange']),()=>patchProv(a,u,'2024-03-01',{pending_change:{url:'https://a.example/p?token=1'}},[]),
+   ()=>setWin(a,u,'2024-03-01','to','2025-01-01',{valid_to:{source:'x'}},admin,'curated')])
+   expect(await fails(bad())).toMatchObject({message:expect.stringMatching(/invalid_(provenance_patch|window_write)/),code:'22023'});
+ });
+ it('patch_security_provenance interleaved with set_security_identifier (isin) keeps both provenance keys',async()=>{
+  const a=await issuer();const t=await ticker();
+  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
+  const isin='US'+String(Math.floor(Math.random()*1e9)).padStart(9,'0')+'0';
+  await Promise.all([patchProv(a,t,'2024-03-01',PC,[]),admin.query(`select public.set_security_identifier($1,$2,'2024-03-01'::date,'isin',$3,$4::jsonb)`,[a,t,isin,JSON.stringify(PI)])]);
+  const prov=(await winState(t)).provenance as Record<string,unknown>;
+  expect(Object.keys(prov).sort()).toEqual(['exchange',...Object.keys(PI),'pending_change'].sort());
+ });
  it('a window write interleaved with an ISIN identifier write on the same row: ISIN first keeps both provenance keys; window first moves the key so the ISIN write finds no row',async()=>{
   const setIsin=(a:string,t:string,from:string,isin:string,on:Pool|PoolClient=admin)=>
    on.query(`select public.set_security_identifier($1,$2,$3::date,'isin',$4,$5::jsonb) v`,[a,t,from,isin,JSON.stringify(PI)]).then(r=>r.rows[0].v as string);
diff --git a/src/lib/entities/load-sec-ticker-change.test.ts b/src/lib/entities/load-sec-ticker-change.test.ts
new file mode 100644
index 0000000..b8ce7ab
--- /dev/null
+++ b/src/lib/entities/load-sec-ticker-change.test.ts
@@ -0,0 +1,124 @@
+// src/lib/entities/load-sec-ticker-change.test.ts
+// Ticker-change detection on the real issuer write path (memory client): spec §4.3.4 fixture
+// T0 (CIK X holds OLD) → T1 (X holds NEW, OLD gone) → T2 (still gone, +7 days, new hash,
+// submissions tickers=['NEW']), plus the waiting, unconfirmed, reappearing and other-CIK paths.
+import {describe,it,expect} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import type {SecExchangeRow} from '../research/entity-keys/parsers';
+import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,planSecLoad,snapshotMetaOf,type TickerChangeDeps} from './load-sec';
+import {resolveIssuer} from './resolve';
+
+const T0='2026-11-01',T1='2026-11-02',T2='2026-11-09',T3='2026-11-20';
+const F=(d:string)=>`${d}T06:00:00.000Z`;
+const H=(c:string)=>c.repeat(64);
+const BATCH='33333333-3333-4333-8333-333333333333';
+const CIK='1000001',OTHER='1000002';
+const UNIVERSE=new Set(['OLD','NEW']);
+const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
+const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
+const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
+async function run(c:ReturnType<typeof memoryTableClient>,rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW'])){
+ await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
+ return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH},{confirm,lastSeenAsOf:async()=>T0});
+}
+const issuerOf=(c:ReturnType<typeof memoryTableClient>,cik:string)=>String(c.rows('issuers').find(x=>x.cik===cik)!.issuer_id);
+const rowOf=(c:ReturnType<typeof memoryTableClient>,ticker:string,validFrom?:string)=>c.rows('issuer_securities').find(x=>x.ticker===ticker&&(validFrom===undefined||x.valid_from===validFrom))!;
+const prov=(row:Record<string,unknown>)=>row.provenance as Record<string,Record<string,unknown>|undefined>;
+
+describe('snapshot gating',()=>{
+ it('rejects older as_of / fetched_at and files below 90% of the previous row count',()=>{
+  const prev={as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')};
+  expect(checkSnapshot(null,{as_of:T0,fetched_at:F(T0),rows:1})).toBe('ok');
+  expect(checkSnapshot(prev,{as_of:T0,fetched_at:F(T2),rows:100})).toBe('stale_snapshot');
+  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T0),rows:100})).toBe('stale_snapshot');
+  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T2),rows:89})).toBe('incomplete_snapshot');
+  expect(checkSnapshot(prev,{as_of:T1,fetched_at:F(T1),rows:90})).toBe('ok');
+  expect(checkSnapshot({as_of:T1,fetched_at:null,rows:null,sha256:null},{as_of:T1,fetched_at:F(T0),rows:1})).toBe('ok');
+ });
+ it('reads the previous snapshot from a batch receipt',()=>{
+  expect(snapshotMetaOf({tool_versions:{as_of:T1,fetched_at:F(T1),rows:'100',sha256:H('1'),file:'x'}})).toEqual({as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')});
+  expect(snapshotMetaOf({tool_versions:{file:'x',as_of:T0}})).toEqual({as_of:T0,fetched_at:null,rows:null,sha256:null});
+  expect(snapshotMetaOf({tool_versions:{}})).toBeNull();
+ });
+ it('indexes file tickers per CIK in exact and normalized form, owners by exact form only',()=>{
+  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW')]);
+  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK-B','BRK.B']);
+  expect(ix.cikByTicker.get('BRK-B')).toBe(CIK);expect(ix.cikByTicker.has('BRK.B')).toBe(false);
+  expect(ix.cikByTicker.get('NEW')).toBe(OTHER);
+ });
+});
+
+describe('detectTickerChanges (spec §4.3.4 fixture, E3)',()=>{
+ it('E3: OLD resolves to X before the change and while pending; after the confirmed close only for the past',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  const x=issuerOf(c,CIK);
+  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
+  const t1=await run(c,[r(CIK,'NEW')],T1,H('1'));
+  expect(t1.pending).toBe(1);
+  expect(rowOf(c,'OLD').valid_to).toBeNull();
+  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']});
+  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T1}))?.issuer_id).toBe(x);
+  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
+  expect(t2.closed).toBe(1);
+  const old=rowOf(c,'OLD');
+  expect(old).toMatchObject({valid_from:T0,valid_to:T1,valid_to_method:'sec_file_absent'});
+  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),submissions_sha256:H('e'),last_seen_as_of:T0});
+  expect(prov(old).pending_change).toMatchObject({replacement_tickers:['NEW']});
+  expect(await resolveIssuer(c,{ticker:'OLD'},{asOf:T1})).toBeNull();
+  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
+  expect(rowOf(c,'NEW')).toMatchObject({issuer_id:x,valid_from:T1,valid_from_method:'first_observed',valid_to:null});
+  const claims=c.rows('issuer_identifier_claims');
+  expect(claims.map(k=>[k.op,k.id_type,k.value,k.source])).toEqual([['evidence_only','ticker','OLD','sec_company_tickers_exchange']]);
+  expect((claims[0].detail as {params:Record<string,unknown>;target:unknown}).params).toMatchObject({suggested_op:'backdate_window',old_ticker:'OLD',replacement_tickers:['NEW'],first_missing_as_of:T1});
+  expect((claims[0].detail as {target:unknown}).target).toEqual({issuer_id:x});
+ });
+ it('waits while fewer than 7 days have passed or the file hash is unchanged',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const soon=await run(c,[r(CIK,'NEW')],'2026-11-05',H('3'));
+  expect(soon.skippedSummary).toMatchObject({close_pending:1});
+  const sameHash=await run(c,[r(CIK,'NEW')],T2,H('1'));
+  expect(sameHash.skippedSummary).toMatchObject({close_pending:1});
+  expect(rowOf(c,'OLD').valid_to).toBeNull();
+ });
+ it('does not close without the submissions confirmation',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const listed=await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW','OLD']));
+  expect(listed.skippedSummary).toMatchObject({close_unconfirmed:1});
+  const down=await run(c,[r(CIK,'NEW')],T2,H('2'),async()=>null);
+  expect(down.errors.map(e=>e.code)).toContain('sec_unavailable');
+  expect(rowOf(c,'OLD').valid_to).toBeNull();
+  expect(c.rows('issuer_identifier_claims')).toEqual([]);
+ });
+ it('clears pending_change when the ticker reappears for the same CIK',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const back=await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],'2026-11-03',H('4'));
+  expect(back.cleared).toBe(1);
+  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
+ });
+ it('a ticker listed under another CIK is an ownership_conflict and is not closed',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(OTHER,'OLD'),r(CIK,'NEW')],T1,H('1'));
+  expect(c.rows('dq_quarantine').some(q=>q.natural_key===`OLD:${T0}`&&q.reason_code==='ownership_conflict'&&(q.detail as {reason:string}).reason==='ticker_listed_under_other_cik')).toBe(true);
+  expect(rowOf(c,'OLD')).toMatchObject({valid_to:null});
+  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
+ });
+ it('after a close, a reappearance opens a new first_observed row and leaves the closed row unchanged',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  await run(c,[r(CIK,'NEW')],T2,H('2'));
+  const closed=structuredClone(rowOf(c,'OLD',T0));
+  await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],T3,H('5'));
+  expect(rowOf(c,'OLD',T0)).toEqual(closed);
+  expect(rowOf(c,'OLD',T3)).toMatchObject({valid_to:null,valid_from_method:'first_observed'});
+  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T3}))?.issuer_id).toBe(issuerOf(c,CIK));
+ });
+});
diff --git a/src/lib/entities/load-sec.ts b/src/lib/entities/load-sec.ts
index bcb6808..c74eb41 100644
--- a/src/lib/entities/load-sec.ts
+++ b/src/lib/entities/load-sec.ts
@@ -4,7 +4,10 @@
 // row of that batch. SEC exchange membership does not establish
 // domicile and the file carries no share class, so country_code is never set and share_class is
 // always 'unknown'.
-import type {TableClient} from '../db/table-client';
+import {callRpc,selectAll,type Row,type TableClient} from '../db/table-client';
+import {fileClaim} from './claims';
+import {sanitizeProvenance} from './provenance';
+import type {ClaimEvidence} from './types';
 import type {BatchCounts,BatchError,BatchStatus} from '../dq/batches';
 import {emptyCounts} from '../dq/batches';
 import {DATASETS} from '../dq/datasets';
@@ -158,3 +161,140 @@ export async function applySecLoad(client:TableClient,plan:SecLoadPlan,opts:SecA
  }
  return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
 }
+
+// ---------------------------------------------------------------- ticker-change detection (spec 3 §4.3.4)
+
+/** Previous successful snapshot, read from an entities.sec batch receipt (tool_versions). */
+export interface SnapshotMeta{as_of:string;fetched_at:string|null;rows:number|null;sha256:string|null}
+export type SnapshotCheck='ok'|'stale_snapshot'|'incomplete_snapshot';
+
+export function snapshotMetaOf(batch:Row):SnapshotMeta|null{
+ const tv=(batch.tool_versions&&typeof batch.tool_versions==='object'?batch.tool_versions:{}) as Record<string,unknown>;
+ if(typeof tv.as_of!=='string')return null;
+ const rows=typeof tv.rows==='string'&&/^\d+$/.test(tv.rows)?Number.parseInt(tv.rows,10):null;
+ return {as_of:tv.as_of,fetched_at:typeof tv.fetched_at==='string'?tv.fetched_at:null,rows,sha256:typeof tv.sha256==='string'?tv.sha256:null};
+}
+
+/** as_of and fetched_at must not go backwards; a file below 90% of the previous data rows is refused. */
+export function checkSnapshot(prev:SnapshotMeta|null,cur:{as_of:string;fetched_at:string;rows:number}):SnapshotCheck{
+ if(!prev)return 'ok';
+ if(cur.as_of<prev.as_of)return 'stale_snapshot';
+ if(prev.fetched_at!==null&&Date.parse(cur.fetched_at)<Date.parse(prev.fetched_at))return 'stale_snapshot';
+ if(prev.rows!==null&&cur.rows*10<prev.rows*9)return 'incomplete_snapshot';
+ return 'ok';
+}
+
+/**
+ * Tickers per CIK as the file lists them, in exact (upper-cased) and normalized form, so a stored
+ * ticker matches either way; owners are indexed by the exact form only (normalization strips Wind
+ * suffixes, BRK.A → BRK, which must not make another CIK look like the owner).
+ */
+export function fileTickerIndex(rows:readonly SecExchangeRow[]):{byCik:Map<string,Set<string>>;cikByTicker:Map<string,string>}{
+ const byCik=new Map<string,Set<string>>(),cikByTicker=new Map<string,string>();
+ for(const r of rows){
+  const exact=r.ticker.trim().toUpperCase();
+  const set=byCik.get(r.cik)??new Set<string>();
+  set.add(exact);
+  const n=normalizeSecurityTicker(r.ticker,'US');if(n)set.add(n);
+  byCik.set(r.cik,set);
+  if(!cikByTicker.has(exact))cikByTicker.set(exact,r.cik);
+ }
+ return {byCik,cikByTicker};
+}
+
+export const CLOSE_MIN_DAYS=7;
+const DAY_MS=86_400_000;
+export interface TickerChangeInput{rows:readonly SecExchangeRow[];asOf:string;fetchedAt:string;fileSha256:string;batchId:string}
+export interface TickerChangeDeps{
+ /** submissions tickers[] for a CIK fetched in this run (the second source); null = SEC unavailable */
+ confirm:(cik:string)=>Promise<{tickers:string[];sha256:string}|null>;
+ /** as_of of the latest successful entities.sec batch strictly before `before`, or null */
+ lastSeenAsOf:(before:string)=>Promise<string|null>;
+}
+export interface TickerChangeResult extends ApplyResult{pending:number;cleared:number;closed:number;claims:number}
+interface PendingChange{first_missing_as_of:string;first_missing_sha256:string;first_missing_fetched_at:string;replacement_tickers:string[];sources:string[]}
+
+const patchProvenance=async(client:TableClient,issuer:string,ticker:string,validFrom:string,set:Record<string,unknown>,remove:string[])=>
+ callRpc(client,'patch_security_provenance',{p_issuer:issuer,p_ticker:ticker,p_valid_from:validFrom,p_set:set,p_remove:remove});
+const pendingOf=(v:unknown):PendingChange|null=>{
+ const o=(v&&typeof v==='object'?v:null) as Partial<PendingChange>|null;
+ if(!o||typeof o.first_missing_as_of!=='string'||typeof o.first_missing_sha256!=='string'||typeof o.first_missing_fetched_at!=='string')return null;
+ return {first_missing_as_of:o.first_missing_as_of,first_missing_sha256:o.first_missing_sha256,first_missing_fetched_at:o.first_missing_fetched_at,
+  replacement_tickers:Array.isArray(o.replacement_tickers)?o.replacement_tickers.map(String):[],sources:Array.isArray(o.sources)?o.sources.map(String):[]};
+};
+
+/**
+ * Runs after applySecLoad on the same file. For every open row with source SEC_SOURCE whose ticker
+ * the file no longer lists for the issuer's CIK: first miss → provenance.pending_change; reappearance
+ * → pending_change removed; close only when still missing, ≥ CLOSE_MIN_DAYS since the first miss
+ * (fetched_at), a different file hash, and the CIK's submissions tickers[] no longer list it. The
+ * close is an OBSERVATION bound (valid_to = first_missing_as_of, method sec_file_absent), never a
+ * ticker-change effective date: that only comes from a reviewed claim (evidence_only filed here).
+ */
+export async function detectTickerChanges(client:TableClient,input:TickerChangeInput,deps:TickerChangeDeps):Promise<TickerChangeResult>{
+ const counts=emptyCounts();const errors:BatchError[]=[];const skipped:string[]=[];
+ let pending=0,cleared=0,closed=0,claims=0;
+ const {byCik,cikByTicker}=fileTickerIndex(input.rows);
+ const open=await selectAll(client,'issuer_securities',{valid_to:null,source:SEC_SOURCE},'ticker');
+ const cikCache=new Map<string,string|null>();
+ const cikOf=async(issuerId:string)=>{
+  if(!cikCache.has(issuerId)){const [i]=await client.select('issuers',{issuer_id:issuerId},{limit:1});cikCache.set(issuerId,i&&i.status==='active'&&typeof i.cik==='string'?i.cik:null);}
+  return cikCache.get(issuerId)!;
+ };
+ const confirmCache=new Map<string,{tickers:string[];sha256:string}|null>();
+ const confirmOf=async(cik:string)=>{if(!confirmCache.has(cik))confirmCache.set(cik,await deps.confirm(cik));return confirmCache.get(cik)!;};
+ for(const row of open){
+  const ticker=String(row.ticker),issuerId=String(row.issuer_id),validFrom=String(row.valid_from);
+  const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
+  const pc=pendingOf(prov.pending_change);
+  const changed=()=>{counts.failed++;errors.push({code:'row_changed',key:`${ticker}:${validFrom}`});};
+  try{
+   const cik=await cikOf(issuerId);
+   if(!cik){skipped.push('no_cik');continue;}
+   if(byCik.get(cik)?.has(ticker)){
+    if(prov.pending_change!==undefined){
+     const out=await patchProvenance(client,issuerId,ticker,validFrom,{},['pending_change']);
+     if(out==='written'){counts.versioned++;cleared++;}else if(out==='not_found')changed();
+    }
+    continue;
+   }
+   const other=cikByTicker.get(ticker);
+   if(other!==undefined&&other!==cik){
+    await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${ticker}:${validFrom}`,reasonCode:'ownership_conflict',
+     detail:{reason:'ticker_listed_under_other_cik',cik:other,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:other},batchId:input.batchId},
+     counts,errors,{code:'ownership_conflict',key:ticker});
+    continue;
+   }
+   if(!pc){
+    const replacement=open.filter(o=>String(o.issuer_id)===issuerId&&String(o.valid_from)===input.asOf&&String(o.ticker)!==ticker).map(o=>String(o.ticker)).sort();
+    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE]}});
+    const out=await patchProvenance(client,issuerId,ticker,validFrom,set,[]);
+    if(out==='written'){counts.versioned++;pending++;}else if(out==='not_found')changed();
+    continue;
+   }
+   if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
+   const conf=await confirmOf(cik);
+   if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
+   if(conf.tickers.map(t=>t.trim().toUpperCase()).includes(ticker)){skipped.push('close_unconfirmed');continue;}
+   if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
+   const lastSeen=await deps.lastSeenAsOf(pc.first_missing_as_of);
+   const provenance=sanitizeProvenance({valid_to:{source:SEC_SOURCE,as_of:input.asOf,first_missing_as_of:pc.first_missing_as_of,first_missing_sha256:pc.first_missing_sha256,
+    closing_sha256:input.fileSha256,submissions_sha256:conf.sha256,last_seen_as_of:lastSeen}});
+   // atomic close: set_security_window merges only valid_to, so pending_change stays on the closed row
+   const closeOut=await callRpc(client,'set_security_window',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_side:'to',p_new_date:pc.first_missing_as_of,p_provenance:provenance,p_to_method:'sec_file_absent'});
+   if(closeOut!=='written'&&closeOut!=='duplicate'){changed();continue;}
+   counts.versioned++;closed++;
+   const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:input.asOf,evidence_sha256:input.fileSha256,locator:`cik:${cik}`};
+   const note=`观测到 ${ticker} 消失、${pc.replacement_tickers.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
+   if(await fileClaim(client,{issuer_id:issuerId,id_type:'ticker',value:ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
+    schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:issuerId},
+    params:{suggested_op:'backdate_window',old_ticker:ticker,replacement_tickers:pc.replacement_tickers,first_missing_as_of:pc.first_missing_as_of,submissions_sha256:conf.sha256,note},
+    evidence,sources:[evidence],
+   }}))claims++;
+  }catch(e){counts.failed++;errors.push({code:'ticker_change_error',key:ticker,message:errorMessage(e)});}
+ }
+ counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
+ const skippedSummary=summarizeSkips(skipped);
+ const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
+ return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},pending,cleared,closed,claims};
+}
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index e79a82c..d1aea31 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "4c560a0ff34819da51f38f55f42f02c269380967341fef1156871e3284c9e200"
+      "sha256": "a7ddd0834603bf04e23e20b078ebcd8ef244a20d4a0c38f5967d03a9669f66f2"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 0f74ee8..721ee35 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -806,19 +806,20 @@ grant execute on function public.set_security_identifier(uuid, text, date, text,
 -- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
 --   p_new_date <= valid_from and no other row of the ticker starting earlier; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
 -- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
---   sets valid_to, valid_to_method = 'delisting'.
+--   sets valid_to, valid_to_method = p_to_method ('delisting' default, or 'sec_file_absent'; others invalid_window_write). Other provenance keys (pending_change) are kept.
 -- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
 -- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
 -- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
 -- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
-create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
+create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb, p_to_method text default 'delisting')
 returns text language plpgsql security definer set search_path = public as $$
 declare v_row public.issuer_securities%rowtype; n int;
 begin
   if p_side is null or p_side not in ('from', 'to') or p_new_date is null or p_ticker is null or p_valid_from is null
      or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
      or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_' || p_side]
-     or not public.claim_provenance_safe(p_provenance) then
+     or not public.claim_provenance_safe(p_provenance)
+     or (p_side = 'to' and (p_to_method is null or p_to_method <> all (array['delisting', 'sec_file_absent']))) then
     raise exception 'invalid_window_write' using errcode = '22023';
   end if;
   perform 1 from public.issuers where issuer_id = p_issuer for share;
@@ -837,17 +838,44 @@ begin
     update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
     where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
   else
-    if v_row.valid_to = p_new_date and v_row.valid_to_method = 'delisting' and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
+    if v_row.valid_to = p_new_date and v_row.valid_to_method = p_to_method and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
     if v_row.valid_to is not null or p_new_date <= v_row.valid_from then return 'conflict'; end if;
-    update public.issuer_securities set valid_to = p_new_date, valid_to_method = 'delisting', provenance = provenance || p_provenance
+    update public.issuer_securities set valid_to = p_new_date, valid_to_method = p_to_method, provenance = provenance || p_provenance
     where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
   end if;
   get diagnostics n = row_count;
   if n <> 1 then return 'conflict'; end if;
   return 'written';
 end $$;
-revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
-grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;
+revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) from public, anon, authenticated;
+grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) to service_role;
+
+-- patch_security_provenance: the only writer of provenance.pending_change (load-sec ticker-change detection, Task 6b).
+-- Lock order issuer FOR SHARE -> row FOR UPDATE; open rows only; both p_set and p_remove limited to the key pending_change.
+-- ONE UPDATE: provenance = (provenance - p_remove) || p_set. Outcomes: 'written', 'duplicate' (no change), 'not_found'.
+create or replace function public.patch_security_provenance(p_issuer uuid, p_ticker text, p_valid_from date, p_set jsonb, p_remove text[])
+returns text language plpgsql security definer set search_path = public as $$
+declare v_row public.issuer_securities%rowtype; v_new jsonb;
+begin
+  if p_ticker is null or p_valid_from is null or p_set is null or jsonb_typeof(p_set) <> 'object' or p_remove is null
+     or exists (select 1 from jsonb_object_keys(p_set) k where k <> 'pending_change')
+     or exists (select 1 from unnest(p_remove) k where k is distinct from 'pending_change')
+     or not public.claim_provenance_safe(p_set) then
+    raise exception 'invalid_provenance_patch' using errcode = '22023';
+  end if;
+  perform 1 from public.issuers where issuer_id = p_issuer for share;
+  if not found then return 'not_found'; end if;
+  select * into v_row from public.issuer_securities s
+  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from and s.valid_to is null for update;
+  if not found then return 'not_found'; end if;
+  v_new := (v_row.provenance - p_remove) || p_set;
+  if v_new = v_row.provenance then return 'duplicate'; end if;
+  update public.issuer_securities set provenance = v_new
+  where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+  return 'written';
+end $$;
+revoke execute on function public.patch_security_provenance(uuid, text, date, jsonb, text[]) from public, anon, authenticated;
+grant execute on function public.patch_security_provenance(uuid, text, date, jsonb, text[]) to service_role;
 
 -- ---------------------------------------------------------------- guarded issuer identifier write (Task 4b review, P1)
 -- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim

exec
/bin/zsh -lc 'cat src/lib/entities/load-sec-ticker-change.test.ts; cat src/lib/entities/provenance.ts; cat src/lib/entities/claims.ts; cat src/lib/entities/identifiers/sec-submissions.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/entities/load-sec-ticker-change.test.ts
// Ticker-change detection on the real issuer write path (memory client): spec §4.3.4 fixture
// T0 (CIK X holds OLD) → T1 (X holds NEW, OLD gone) → T2 (still gone, +7 days, new hash,
// submissions tickers=['NEW']), plus the waiting, unconfirmed, reappearing and other-CIK paths.
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import type {SecExchangeRow} from '../research/entity-keys/parsers';
import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,planSecLoad,snapshotMetaOf,type TickerChangeDeps} from './load-sec';
import {resolveIssuer} from './resolve';

const T0='2026-11-01',T1='2026-11-02',T2='2026-11-09',T3='2026-11-20';
const F=(d:string)=>`${d}T06:00:00.000Z`;
const H=(c:string)=>c.repeat(64);
const BATCH='33333333-3333-4333-8333-333333333333';
const CIK='1000001',OTHER='1000002';
const UNIVERSE=new Set(['OLD','NEW']);
const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
async function run(c:ReturnType<typeof memoryTableClient>,rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW'])){
 await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
 return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH},{confirm,lastSeenAsOf:async()=>T0});
}
const issuerOf=(c:ReturnType<typeof memoryTableClient>,cik:string)=>String(c.rows('issuers').find(x=>x.cik===cik)!.issuer_id);
const rowOf=(c:ReturnType<typeof memoryTableClient>,ticker:string,validFrom?:string)=>c.rows('issuer_securities').find(x=>x.ticker===ticker&&(validFrom===undefined||x.valid_from===validFrom))!;
const prov=(row:Record<string,unknown>)=>row.provenance as Record<string,Record<string,unknown>|undefined>;

describe('snapshot gating',()=>{
 it('rejects older as_of / fetched_at and files below 90% of the previous row count',()=>{
  const prev={as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')};
  expect(checkSnapshot(null,{as_of:T0,fetched_at:F(T0),rows:1})).toBe('ok');
  expect(checkSnapshot(prev,{as_of:T0,fetched_at:F(T2),rows:100})).toBe('stale_snapshot');
  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T0),rows:100})).toBe('stale_snapshot');
  expect(checkSnapshot(prev,{as_of:T2,fetched_at:F(T2),rows:89})).toBe('incomplete_snapshot');
  expect(checkSnapshot(prev,{as_of:T1,fetched_at:F(T1),rows:90})).toBe('ok');
  expect(checkSnapshot({as_of:T1,fetched_at:null,rows:null,sha256:null},{as_of:T1,fetched_at:F(T0),rows:1})).toBe('ok');
 });
 it('reads the previous snapshot from a batch receipt',()=>{
  expect(snapshotMetaOf({tool_versions:{as_of:T1,fetched_at:F(T1),rows:'100',sha256:H('1'),file:'x'}})).toEqual({as_of:T1,fetched_at:F(T1),rows:100,sha256:H('1')});
  expect(snapshotMetaOf({tool_versions:{file:'x',as_of:T0}})).toEqual({as_of:T0,fetched_at:null,rows:null,sha256:null});
  expect(snapshotMetaOf({tool_versions:{}})).toBeNull();
 });
 it('indexes file tickers per CIK in exact and normalized form, owners by exact form only',()=>{
  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW')]);
  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK-B','BRK.B']);
  expect(ix.cikByTicker.get('BRK-B')).toBe(CIK);expect(ix.cikByTicker.has('BRK.B')).toBe(false);
  expect(ix.cikByTicker.get('NEW')).toBe(OTHER);
 });
});

describe('detectTickerChanges (spec §4.3.4 fixture, E3)',()=>{
 it('E3: OLD resolves to X before the change and while pending; after the confirmed close only for the past',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  const x=issuerOf(c,CIK);
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
  const t1=await run(c,[r(CIK,'NEW')],T1,H('1'));
  expect(t1.pending).toBe(1);
  expect(rowOf(c,'OLD').valid_to).toBeNull();
  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']});
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T1}))?.issuer_id).toBe(x);
  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
  expect(t2.closed).toBe(1);
  const old=rowOf(c,'OLD');
  expect(old).toMatchObject({valid_from:T0,valid_to:T1,valid_to_method:'sec_file_absent'});
  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),submissions_sha256:H('e'),last_seen_as_of:T0});
  expect(prov(old).pending_change).toMatchObject({replacement_tickers:['NEW']});
  expect(await resolveIssuer(c,{ticker:'OLD'},{asOf:T1})).toBeNull();
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
  expect(rowOf(c,'NEW')).toMatchObject({issuer_id:x,valid_from:T1,valid_from_method:'first_observed',valid_to:null});
  const claims=c.rows('issuer_identifier_claims');
  expect(claims.map(k=>[k.op,k.id_type,k.value,k.source])).toEqual([['evidence_only','ticker','OLD','sec_company_tickers_exchange']]);
  expect((claims[0].detail as {params:Record<string,unknown>;target:unknown}).params).toMatchObject({suggested_op:'backdate_window',old_ticker:'OLD',replacement_tickers:['NEW'],first_missing_as_of:T1});
  expect((claims[0].detail as {target:unknown}).target).toEqual({issuer_id:x});
 });
 it('waits while fewer than 7 days have passed or the file hash is unchanged',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const soon=await run(c,[r(CIK,'NEW')],'2026-11-05',H('3'));
  expect(soon.skippedSummary).toMatchObject({close_pending:1});
  const sameHash=await run(c,[r(CIK,'NEW')],T2,H('1'));
  expect(sameHash.skippedSummary).toMatchObject({close_pending:1});
  expect(rowOf(c,'OLD').valid_to).toBeNull();
 });
 it('does not close without the submissions confirmation',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const listed=await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW','OLD']));
  expect(listed.skippedSummary).toMatchObject({close_unconfirmed:1});
  const down=await run(c,[r(CIK,'NEW')],T2,H('2'),async()=>null);
  expect(down.errors.map(e=>e.code)).toContain('sec_unavailable');
  expect(rowOf(c,'OLD').valid_to).toBeNull();
  expect(c.rows('issuer_identifier_claims')).toEqual([]);
 });
 it('clears pending_change when the ticker reappears for the same CIK',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  const back=await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],'2026-11-03',H('4'));
  expect(back.cleared).toBe(1);
  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
 });
 it('a ticker listed under another CIK is an ownership_conflict and is not closed',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(OTHER,'OLD'),r(CIK,'NEW')],T1,H('1'));
  expect(c.rows('dq_quarantine').some(q=>q.natural_key===`OLD:${T0}`&&q.reason_code==='ownership_conflict'&&(q.detail as {reason:string}).reason==='ticker_listed_under_other_cik')).toBe(true);
  expect(rowOf(c,'OLD')).toMatchObject({valid_to:null});
  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
 });
 it('after a close, a reappearance opens a new first_observed row and leaves the closed row unchanged',async()=>{
  const c=memoryTableClient(KEYS);
  await run(c,[r(CIK,'OLD')],T0,H('0'));
  await run(c,[r(CIK,'NEW')],T1,H('1'));
  await run(c,[r(CIK,'NEW')],T2,H('2'));
  const closed=structuredClone(rowOf(c,'OLD',T0));
  await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],T3,H('5'));
  expect(rowOf(c,'OLD',T0)).toEqual(closed);
  expect(rowOf(c,'OLD',T3)).toMatchObject({valid_to:null,valid_from_method:'first_observed'});
  expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T3}))?.issuer_id).toBe(issuerOf(c,CIK));
 });
});
// src/lib/entities/provenance.ts
// Public provenance whitelist (spec 3 §3.1; plan 3 contract C2). issuer_securities.provenance and
// issuers.provenance are anon-readable, so writers pass every object through sanitizeProvenance: only
// whitelisted top-level keys; nested values may carry source names, ids, dates, hashes and the source
// row values an evidence method copied, never a secret-looking key, URL credentials or a token-like
// query parameter, or a UUID (user ids are UUIDs; no public provenance value needs one).
// NOTE: the issuer write path (upsertIssuerByIdentifiers) is NOT yet routed through sanitizeProvenance
// (ISSUER_PROVENANCE_KEYS is ready for it); that wiring is a runbook 9.x follow-up.
export const PROVENANCE_KEYS=['isin','figi','valid_from','valid_to','pending_change'] as const;
export const ISSUER_PROVENANCE_KEYS=['lei','cik','usci','cninfo_org_id','hkex_stock_code_primary','canonical_name_zh','canonical_name_en','country_code'] as const;
export type ProvenanceErrorCode='not_object'|'unknown_key'|'secret_key'|'url_credentials'|'secret_text'|'uuid_value'|'bad_value'|'too_deep'|'too_long'|'too_large';

export class ProvenanceError extends Error{
 constructor(readonly code:ProvenanceErrorCode,readonly path:string){
  super(`provenance_rejected:${code}:${path}`);
  this.name='ProvenanceError';
 }
}

// These rules include every rule of the SQL guard claim_provenance_safe (migration 20261107090000), which
// is authoritative: TS must reject everything SQL rejects. TS may be stricter (URL userinfo, auth/session/
// email keys, 8 KB total): a claim then fails at filing instead of at acceptance.
// Deliberately strict: bare `auth` and `private` also reject innocent keys such as `author` or `private_company`;
// a false rejection fails loudly at filing, a missed secret would be public.
const SECRET_KEY=/(secret|token|passw|api[_-]?key|apikey|auth|authorization|user_?id|cookie|session|credential|private|email)/i;
const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const URL_QUERY=/[a-z][a-z0-9+.-]*:\/\/[^\s]*[?#]|\?[^\s]*=/i;
const SECRET_TEXT=/(token|secret|passw[a-z]*|api[_-]?key|\bkey)\s*[=:]/i;
/** URL userinfo (user:pw@host), also protocol-relative, with extra slashes, or hidden by control/whitespace characters. */
function hasUserinfo(v:string):boolean{
 const c=v.replace(/[\x00-\x20\x7f]/g,'');
 if(/\/\/+[^/?#]*@/.test(c))return true;
 try{const u=new URL(c,'https://base.invalid/');return u.username!==''||u.password!=='';}
 catch{return false;}
}
const MAX_DEPTH=4;
const MAX_STRING=500;
const MAX_JSON=8192;
const isPlainObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;

function clean(v:unknown,path:string,depth:number):unknown{
 if(depth>MAX_DEPTH)throw new ProvenanceError('too_deep',path);
 if(v===null||typeof v==='boolean')return v;
 if(typeof v==='number'){if(!Number.isFinite(v))throw new ProvenanceError('bad_value',path);return v;}
 if(typeof v==='string'){
  if(v.length>MAX_STRING)throw new ProvenanceError('too_long',path);
  if(URL_QUERY.test(v)||hasUserinfo(v))throw new ProvenanceError('url_credentials',path);
  if(UUID.test(v))throw new ProvenanceError('uuid_value',path);
  if(SECRET_TEXT.test(v))throw new ProvenanceError('secret_text',path);
  return v;
 }
 if(Array.isArray(v))return v.map((x,i)=>clean(x,`${path}[${i}]`,depth+1));
 if(isPlainObject(v)){
  const out:Record<string,unknown>={};
  for(const [k,x] of Object.entries(v)){
   if(SECRET_KEY.test(k))throw new ProvenanceError('secret_key',`${path}.${k}`);
   if(x===undefined)continue;
   out[k]=clean(x,`${path}.${k}`,depth+1);
  }
  return out;
 }
 throw new ProvenanceError('bad_value',path);
}

/** A deep copy of `p` restricted to `allowed` top-level keys; throws ProvenanceError on anything unsafe. */
export function sanitizeProvenance(p:unknown,allowed:readonly string[]=PROVENANCE_KEYS):Record<string,unknown>{
 if(!isPlainObject(p))throw new ProvenanceError('not_object','$');
 for(const k of Object.keys(p))if(!allowed.includes(k))throw new ProvenanceError('unknown_key',k);
 const out=clean(p,'$',0) as Record<string,unknown>;
 if(JSON.stringify(out).length>MAX_JSON)throw new ProvenanceError('too_large','$');
 return out;
}
// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!(typeof pa.suggested_op==='string'&&SUGGESTED_OPS.includes(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
 * pending claim matching `key` through the row-locking SQL function append_claim_evidence (migration
 * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
 * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
 * params / the first evidence are never touched. 'not_found' = the claim was resolved meanwhile.
 * Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,detail:ClaimDetail):Promise<'ok'|'not_found'>{
 for(const evidence of [detail.evidence,...(detail.sources??[])]){
  const r=await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
  if(r==='not_found')return 'not_found';
 }
 return 'ok';
}

/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
function dedupeSources(detail:ClaimDetail):ClaimEvidence[]{
 const seen=new Set([`${detail.evidence.source}\u0000${detail.evidence.evidence_sha256}`]);
 return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → every incoming evidence item
 * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
 * unique index) is treated the same way. If the pending claim was resolved between the lookup and the
 * append ('not_found'), the whole step is retried once against the current state (a new pending claim
 * is inserted when none is pending); when that still persists nothing the call throws
 * claim_not_persisted (retryable) — it never returns false without having persisted the evidence.
 * Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 for(let attempt=0;attempt<2;attempt++){
  if((await client.select('issuer_identifier_claims',key,{limit:1})).length){
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
   continue;
  }
  try{
   await client.insert('issuer_identifier_claims',{
    id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
   });
   return true;
  }catch(e){
   if(!isUnique(e))throw e;
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
  }
 }
 throw new Error('claim_not_persisted');
}
// src/lib/entities/identifiers/sec-submissions.ts
// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
// User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
// main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
// merged snapshot. Parsers are pure and strict about the columnar `filings.recent` shape (every
// column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
// never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
import type {Budget} from '../../facts/types';
import type {Pacer} from '../../facts/providers/shared';
import {PacerError,SEC_MIN_INTERVAL_MS as SHARED_INTERVAL,secPacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeCik} from '../../research/entity-keys/identifiers';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import type {ClaimInput} from '../claims';
import type {ClaimEvidence} from '../types';

export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
export const SEC_MIN_INTERVAL_MS=SHARED_INTERVAL;
export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;

export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
export interface FormerName{name:string;from:string|null;to:string|null}
export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
export interface StoredDoc{name:string;sha256:string;path:string}
export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
export class SecSubmissionsError extends Error{
 constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string,readonly raw?:{sha256:string;path:string}){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
}
export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';

/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
export function submissionsCategory(raw:string|null|undefined):FilerAcceleration{
 const s=(raw??'').toLowerCase();
 if(s.includes('non-accelerated'))return 'non_accelerated';
 if(s.includes('large accelerated'))return 'large_accelerated';
 if(s.includes('accelerated filer'))return 'accelerated';
 return 'unknown';
}

const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
const invalid=(detail:string)=>new SecSubmissionsError('invalid_schema',detail);

function columnar(o:unknown,page:string):SubmissionFiling[]{
 if(!o||typeof o!=='object'||Array.isArray(o))throw invalid(`${page}: not an object`);
 const c=o as Record<string,unknown>;
 const acc=c.accessionNumber;
 if(!Array.isArray(acc))throw invalid(`${page}: accessionNumber`);
 const col=(k:string,required:boolean):unknown[]|null=>{
  const v=c[k];
  if(v===undefined&&!required)return null;
  if(!Array.isArray(v)||v.length!==acc.length)throw invalid(`${page}: ${k}`);
  return v;
 };
 const fd=col('filingDate',true)!,form=col('form',true)!;
 const rd=col('reportDate',false),ad=col('acceptanceDateTime',false),pd=col('primaryDocument',false),ix=col('isInlineXBRL',false);
 return acc.map((a,i)=>{
  if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
  const x=ix?.[i];
  return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page};
 });
}
const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};

export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}

export function parseSubmissions(json:string):ParsedSubmissions{
 const doc=parseJson(json,'main');
 if(!doc||typeof doc!=='object'||Array.isArray(doc))throw invalid('main: not an object');
 const d=doc as Record<string,unknown>;
 let cik:string;
 try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
 const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
 if(!filings||typeof filings!=='object')throw invalid('filings');
 // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
 const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
 const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
 const tickerList=(v:unknown)=>{
  const all=requiredStrings(v,'tickers').map(t=>t.trim().toUpperCase());
  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
 };
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
 const fye=text(d.fiscalYearEnd);
 return {
  cik,name:text(d.name),category:text(d.category),
  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
  ...tickerList(d.tickers),exchanges:strings(d.exchanges),
  formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
  }),
  filings:columnar(filings.recent,'recent'),
  files:requiredArray(filings.files,'filings.files').map(f=>{
   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
   if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
   return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
  }),
 };
}

export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget;
 /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}

const FETCH_TIMEOUT_MS=30_000;
/** Runs a parse of stored bytes; a schema failure carries the stored document's sha256/path so the evidence can be found. */
function parseStored<T>(doc:StoredDoc,parse:()=>T):T{
 try{return parse();}
 catch(e){
  if(e instanceof SecSubmissionsError&&!e.raw)throw new SecSubmissionsError(e.code,e.message.replace(/^[a-z_]+: ?/,''),{sha256:doc.sha256,path:doc.path});
  throw e;
 }
}
// Process-wide: SEC's limit is per source address, so every SEC caller (also companyfacts) shares secPacer.
const SEC_PACER:Pacer=secPacer;
const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});

export function submissionsClient(deps:FetchSubmissionsDeps){
 const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const clock=deps.clock??(()=>new Date());
 const budget=deps.budget??unlimited();
 const pacer=deps.pacer??SEC_PACER;
 // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
 const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
  try{
   await pacer.admit({budget,reserveMs:0,now:deps.now,sleep:deps.sleep as never});
  }catch(e){
   if(e instanceof PacerError)throw new SecSubmissionsError('sec_unavailable',`${name}: ${e.code}`);
   throw e;
  }
  let res:Response;
  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
  const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
  if(!res.ok){
   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported with its sha256/path.
   let stored:{sha256:string;path:string};
   try{stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`,{sha256:stored.sha256,path:stored.path});
  }
  const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
  return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
 };
 return {
  /** coverFrom: also fetch every files[] page whose filingTo >= coverFrom ('YYYY-MM-DD'); null/undefined: main document only. */
  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
   const c=normalizeCik(cik);
   const fetchedAt=clock().toISOString();
   const main=await get(submissionsUrl(c),c,'main');
   const parsed=parseStored(main.doc,()=>{const x=parseSubmissions(new TextDecoder().decode(main.bytes));if(x.cik!==c)throw invalid(`cik ${x.cik} != ${c}`);return x;});
   const from=opts.coverFrom??null;
   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
   const pages:StoredDoc[]=[];
   const filings=[...parsed.filings];
   const seen=new Set(filings.map(f=>f.accessionNumber));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
   }
   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
  },
 };
}

export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));

export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
 '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
 '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
 '25':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
 '25-NSE':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
};

/** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
 const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
 return snap.parsed.filings.flatMap(f=>{
  const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
  const sha=rule?shaOf(f.page):null;
  if(!rule||!sha)return [];
  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
   schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
   params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
  }}];
 });
}

exec
/bin/zsh -lc "sed -n '1,165p' src/lib/entities/load-sec.ts; cat src/lib/entities/normalize.ts 2>/dev/null; rg -n 'normalizeSecurityTicker|function finishBatch|status.*partial' src/lib/entities src/lib/dq/batches.ts | head -35; nl -ba src/lib/entities/load-sec.ts | sed -n '263,301p'; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'; ls -a | head -25; cat src/lib/dq/batches.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Load US issuers and their listed securities from SEC company_tickers_exchange.json.
// planSecLoad is pure. applySecLoad performs the public writes through a TableClient and returns
// receipt counts; the script owns the ingest batch, and every conflict is parked as a dq_quarantine
// row of that batch. SEC exchange membership does not establish
// domicile and the file carries no share class, so country_code is never set and share_class is
// always 'unknown'.
import {callRpc,selectAll,type Row,type TableClient} from '../db/table-client';
import {fileClaim} from './claims';
import {sanitizeProvenance} from './provenance';
import type {ClaimEvidence} from './types';
import type {BatchCounts,BatchError,BatchStatus} from '../dq/batches';
import {emptyCounts} from '../dq/batches';
import {DATASETS} from '../dq/datasets';
import type {QuarantineInput} from '../dq/quarantine';
import {quarantine} from '../dq/quarantine';
import {normalizeSecurityTicker} from '../securities/ticker';
import type {SecExchangeParse,SecExchangeRow} from '../research/entity-keys/parsers';
import {MAX_SEC_ROWS} from '../research/entity-keys/parsers';
import {attachSecurity,upsertIssuerByIdentifiers} from './issuers';

export const SEC_SOURCE='sec_company_tickers_exchange';

type FieldProvenance={source:string;as_of:string};
export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{valid_from:{source:string;as_of:string;row:{exchange:string}}}}
export interface SecLoadPlan{asOf:string;issuers:PlannedIssuer[];securities:PlannedSecurity[];skipped:string[]}

/**
 * The SEC ticker as written (upper-cased) wins over its normalized form, so `BRK.A` never
 * collapses to `BRK` through Wind-suffix stripping when the universe lists `BRK.A`.
 */
function universeTicker(raw:string,universe:ReadonlySet<string>):string|null{
 const exact=raw.trim().toUpperCase();
 if(universe.has(exact))return exact;
 const normalized=normalizeSecurityTicker(raw,'US');
 return normalized&&universe.has(normalized)?normalized:null;
}

/**
 * Keep rows whose ticker is in the US universe. One issuer per CIK (first row's name); the first
 * kept ticker of a CIK in file order is primary. `skipped` lists raw tickers not in the universe.
 * A ticker repeated across rows is kept each time so the writer reports it as duplicate/conflict.
 */
export function planSecLoad(rows:SecExchangeRow[],universe:ReadonlySet<string>,asOf:string):SecLoadPlan{
 if(rows.length>MAX_SEC_ROWS)throw new Error('too_many_rows');
 const prov=():FieldProvenance=>({source:SEC_SOURCE,as_of:asOf});
 const issuers=new Map<string,PlannedIssuer>();
 const securities:PlannedSecurity[]=[];
 const skipped:string[]=[];
 for(const r of rows){
  const ticker=universeTicker(r.ticker,universe);
  if(!ticker){skipped.push(r.ticker);continue;}
  const first=!issuers.has(r.cik);
  if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
  // Public provenance keeps the whitelist (spec 3 §3.1): the exchange is a copied source-row value of valid_from.
  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{valid_from:{source:SEC_SOURCE,as_of:asOf,row:{exchange:r.exchange}}}});
 }
 return {asOf,issuers:[...issuers.values()],securities,skipped};
}

/** skippedSummary: expected filtering (informational); rejectedSummary: invalid input (degrades status). */
export interface ApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>}

export const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);

/** Count skip reasons by their code (the part before ':') so the summary stays short. */
export function summarizeSkips(reasons:Iterable<string>):Record<string,number>{
 const out:Record<string,number>={};
 for(const r of reasons){const code=r.split(':')[0];out[code]=(out[code]??0)+1;}
 return out;
}

/**
 * Skipped and rejected items cannot be counted in BatchCounts, so each kind surfaces as ONE leading
 * error entry: `skipped_summary` (informational) then `rejected_summary` (not informational, so
 * the batch becomes partial or failed).
 */
export function withSkippedSummary(errors:BatchError[],summary:Record<string,number>,rejected:Record<string,number>={}):BatchError[]{
 const lead:BatchError[]=[];
 if(Object.keys(summary).length)lead.push({code:'skipped_summary',message:JSON.stringify(summary)});
 if(Object.keys(rejected).length)lead.push({code:'rejected_summary',message:JSON.stringify(rejected)});
 return [...lead,...errors];
}

/**
 * Shared status/exit/freshness policy for the entity loaders: exit 1 when the batch failed, any
 * row failed or any input row was rejected as invalid; the freshness attempt is ok only on
 * success, or on a partial run with no failures that actually landed rows (a run that only
 * quarantined is not ok).
 */
export function loaderOutcome(status:BatchStatus,counts:BatchCounts,rejected:Record<string,number>={}):{ok:boolean;exitCode:0|1}{
 const ok=status==='success'||(status==='partial'&&counts.failed===0&&counts.inserted+counts.duplicates>0);
 return {ok,exitCode:status==='failed'||counts.failed>0||Object.keys(rejected).length>0?1:0};
}

/**
 * Records a conflict: pushes `error`, then parks the row in dq_quarantine (deduped on the open
 * key). The row counts as quarantined only once the quarantine row is written; if that write
 * fails it counts as failed with an extra `quarantine_error`.
 */
export async function parkConflict(client:TableClient,input:QuarantineInput,counts:BatchCounts,errors:BatchError[],error:BatchError):Promise<void>{
 errors.push(error);
 try{await quarantine(client,input);counts.quarantined++;}
 catch(e){counts.failed++;errors.push({code:'quarantine_error',key:error.key,message:errorMessage(e)});}
}

/** Quarantine reason code for an issuer conflict: a match on a retired issuer is kept apart. */
export const issuerReasonCode=(reason:string|undefined)=>reason==='inactive_issuer'?'inactive_issuer':'issuer_conflict';

export const SEC_DATASET=DATASETS.entities.sec;

export interface SecApplyOptions{asOf:string;batchId:string;batchProducerMeta:{sourceRows:number;rejected:SecExchangeParse['rejected']}}

/**
 * Writes the plan to the public issuer master. `fetched` is the number of SEC data rows; each
 * issuer and security write has one outcome; securities whose issuer failed or was quarantined
 * count as failed (`blocked_by_issuer`). Issuer conflicts (key: cik) and ownership conflicts (key:
 * `ticker:valid_from`) are quarantined under `opts.batchId` with the rejected input as payload.
 * Not-in-universe rows go to skippedSummary; producer rejects (`rejected_*`) to rejectedSummary.
 */
export async function applySecLoad(client:TableClient,plan:SecLoadPlan,opts:SecApplyOptions):Promise<ApplyResult>{
 if(plan.asOf!==opts.asOf)throw new Error('as_of_mismatch');
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 counts.fetched=opts.batchProducerMeta.sourceRows;
 const skippedSummary=summarizeSkips(plan.skipped.map(()=>'not_in_universe'));
 const rejectedSummary=summarizeSkips(opts.batchProducerMeta.rejected.map(r=>`rejected_${r.reason}`));
 if(plan.issuers.length===0){
  errors.push({code:'empty_plan',message:'no SEC row matched the US universe'});
  return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
 }

 const issuerByCik=new Map<string,string>();
 for(const issuer of plan.issuers){
  try{
   const res=await upsertIssuerByIdentifiers(client,issuer);
   if(res.conflict||!res.issuer_id){
    await parkConflict(client,{dataset:SEC_DATASET,table:'issuers',naturalKey:issuer.cik,reasonCode:issuerReasonCode(res.reason),detail:{reason:res.reason??null},payload:{cik:issuer.cik,canonical_name_en:issuer.canonical_name_en},batchId:opts.batchId},counts,errors,{code:'issuer_conflict',key:issuer.cik,message:res.reason});
    continue;
   }
   issuerByCik.set(issuer.cik,res.issuer_id);
   if(res.created)counts.inserted++;else counts.duplicates++;
  }catch(e){counts.failed++;errors.push({code:'issuer_error',key:issuer.cik,message:errorMessage(e)});}
 }

 for(const sec of plan.securities){
  const issuer_id=issuerByCik.get(sec.cik);
  if(!issuer_id){counts.failed++;errors.push({code:'blocked_by_issuer',key:sec.ticker,message:sec.cik});continue;}
  const {cik:_cik,...rest}=sec;
  try{
   const res=await attachSecurity(client,{...rest,issuer_id});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${sec.ticker}:${sec.valid_from}`,reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',cik:sec.cik},
    payload:{ticker:sec.ticker,isin:null,share_class:sec.share_class,is_primary:sec.is_primary,valid_from:sec.valid_from,valid_to:null,cik:sec.cik},batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:sec.ticker});
  }catch(e){
   counts.failed++;
   const msg=errorMessage(e);
   errors.push({code:msg==='issuer_not_active'?'issuer_not_active':'security_error',key:sec.ticker,message:msg});
  }
 }
 return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary};
}

// ---------------------------------------------------------------- ticker-change detection (spec 3 §4.3.4)
// Input normalization shared by the issuer write path. Pure: no DB access.
import {isValidIsin} from '../research/entity-keys/identifiers';

export const isBlank=(v:unknown)=>v==null||(typeof v==='string'&&v.trim()==='');

/** Blank → null; otherwise trimmed, upper-cased and check-digit validated. */
export function normalizeIsin(v:unknown):string|null{
 if(isBlank(v))return null;
 const isin=String(v).trim().toUpperCase();
 if(!isValidIsin(isin))throw new Error('invalid_identifier:isin');
 return isin;
}

/** Blank → null; 1–5 digits padded to the 5-digit HKEX form; anything else is rejected. */
export function normalizeHkexCode(v:unknown):string|null{
 if(isBlank(v))return null;
 const code=String(v).trim();
 if(!/^\d{1,5}$/.test(code))throw new Error('invalid_identifier:hkex');
 return code.padStart(5,'0');
}

/** Trimmed and upper-cased; blank or non-string is rejected. */
export function normalizeTicker(v:unknown):string{
 if(typeof v!=='string'||isBlank(v))throw new Error('invalid_ticker');
 return v.trim().toUpperCase();
}
src/lib/dq/batches.ts:88:export async function finishBatch(client:TableClient,batchId:string,result:{counts:BatchCounts;errors:BatchError[];rejected?:boolean},now=new Date()):Promise<BatchStatus>{
src/lib/entities/link-research.test.ts:210:  expect(status).toBe('partial');
src/lib/entities/resolve.ts:15:import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/resolve.ts:73: const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
src/lib/entities/load-sec.ts:16:import {normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/load-sec.ts:35: const normalized=normalizeSecurityTicker(raw,'US');
src/lib/entities/load-sec.ts:92: const ok=status==='success'||(status==='partial'&&counts.failed===0&&counts.inserted+counts.duplicates>0);
src/lib/entities/load-sec.ts:198:  const n=normalizeSecurityTicker(r.ticker,'US');if(n)set.add(n);
src/lib/entities/link-research.ts:14:import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/link-research.ts:80: if(s.market!=='other')return {ticker:normalizeSecurityTicker(s.exchange_code,s.market),market:s.market};
src/lib/entities/link-research.ts:81: return {ticker:(market&&normalizeSecurityTicker(s.exchange_code,market))||s.exchange_code.trim().toUpperCase(),market};
src/lib/entities/load-sec.test.ts:137:  expect(status).toBe('partial');
src/lib/entities/submissions-evidence.ts:9:import {normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/submissions-evidence.ts:37:  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
src/lib/entities/identifiers/openfigi.ts:13:import {normalizeSecurityTicker} from '../../securities/ticker';
src/lib/entities/identifiers/openfigi.ts:198: if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
src/lib/entities/identifiers/openfigi.ts:199: if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
   263	    await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${ticker}:${validFrom}`,reasonCode:'ownership_conflict',
   264	     detail:{reason:'ticker_listed_under_other_cik',cik:other,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:other},batchId:input.batchId},
   265	     counts,errors,{code:'ownership_conflict',key:ticker});
   266	    continue;
   267	   }
   268	   if(!pc){
   269	    const replacement=open.filter(o=>String(o.issuer_id)===issuerId&&String(o.valid_from)===input.asOf&&String(o.ticker)!==ticker).map(o=>String(o.ticker)).sort();
   270	    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE]}});
   271	    const out=await patchProvenance(client,issuerId,ticker,validFrom,set,[]);
   272	    if(out==='written'){counts.versioned++;pending++;}else if(out==='not_found')changed();
   273	    continue;
   274	   }
   275	   if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
   276	   const conf=await confirmOf(cik);
   277	   if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
   278	   if(conf.tickers.map(t=>t.trim().toUpperCase()).includes(ticker)){skipped.push('close_unconfirmed');continue;}
   279	   if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
   280	   const lastSeen=await deps.lastSeenAsOf(pc.first_missing_as_of);
   281	   const provenance=sanitizeProvenance({valid_to:{source:SEC_SOURCE,as_of:input.asOf,first_missing_as_of:pc.first_missing_as_of,first_missing_sha256:pc.first_missing_sha256,
   282	    closing_sha256:input.fileSha256,submissions_sha256:conf.sha256,last_seen_as_of:lastSeen}});
   283	   // atomic close: set_security_window merges only valid_to, so pending_change stays on the closed row
   284	   const closeOut=await callRpc(client,'set_security_window',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_side:'to',p_new_date:pc.first_missing_as_of,p_provenance:provenance,p_to_method:'sec_file_absent'});
   285	   if(closeOut!=='written'&&closeOut!=='duplicate'){changed();continue;}
   286	   counts.versioned++;closed++;
   287	   const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:input.asOf,evidence_sha256:input.fileSha256,locator:`cik:${cik}`};
   288	   const note=`观测到 ${ticker} 消失、${pc.replacement_tickers.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
   289	   if(await fileClaim(client,{issuer_id:issuerId,id_type:'ticker',value:ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
   290	    schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:issuerId},
   291	    params:{suggested_op:'backdate_window',old_ticker:ticker,replacement_tickers:pc.replacement_tickers,first_missing_as_of:pc.first_missing_as_of,submissions_sha256:conf.sha256,note},
   292	    evidence,sources:[evidence],
   293	   }}))claims++;
   294	  }catch(e){counts.failed++;errors.push({code:'ticker_change_error',key:ticker,message:errorMessage(e)});}
   295	 }
   296	 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
   297	 const skippedSummary=summarizeSkips(skipped);
   298	 const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
   299	 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},pending,cleared,closed,claims};
   300	}
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
The confirmation path can incorrectly close normalized tickers that submissions still lists. Claim persistence also has a failure window that ordinary retries cannot recover.

Full review comments:

- [P1] Normalize submissions tickers before confirming absence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:278-278
  When a stored ticker is normalized (for example, `BRK.B` loaded from SEC's `BRK-B`), the submissions check compares only upper-cased raw strings. If the exchange file omits that security for seven days while submissions still lists `BRK-B`, this check incorrectly confirms absence and closes the active security. Apply the same exact-and-normalized matching used by the file index before allowing a close.

- [P2] Make claim filing recoverable after closing a security — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:284-289
  If `fileClaim` fails after the window RPC succeeds, the security remains closed but its review claim is missing. Subsequent runs select only open securities, so retrying the failed batch never retries that claim, permanently losing the evidence-review workflow for this change. Persist the close and claim atomically, or add a durable retry path that also processes closed rows with missing claims.
The confirmation path can incorrectly close normalized tickers that submissions still lists. Claim persistence also has a failure window that ordinary retries cannot recover.

Full review comments:

- [P1] Normalize submissions tickers before confirming absence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:278-278
  When a stored ticker is normalized (for example, `BRK.B` loaded from SEC's `BRK-B`), the submissions check compares only upper-cased raw strings. If the exchange file omits that security for seven days while submissions still lists `BRK-B`, this check incorrectly confirms absence and closes the active security. Apply the same exact-and-normalized matching used by the file index before allowing a close.

- [P2] Make claim filing recoverable after closing a security — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:284-289
  If `fileClaim` fails after the window RPC succeeds, the security remains closed but its review claim is missing. Subsequent runs select only open securities, so retrying the failed batch never retries that claim, permanently losing the evidence-review workflow for this change. Persist the close and claim atomically, or add a durable retry path that also processes closed rows with missing claims.

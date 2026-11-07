OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b02e-d751-71c1-b67e-5b7d74d423a5
--------
user
commit 7c22918
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 7c22918; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 557ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-bQ3C2Lv2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-QumL5GZC' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4W5esCBo' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-uRbB5MTZ' (errno=Operation not permitted)
7c22918 fix(entities): load-sec ticker-change review (one ticker rule, rejected rows unknown, conditional close_security_absent, durable claims, single set_security_window, archived snapshots, last_seen from retained files)
 scripts/entity-keys/load-sec-issuers.ts            |  38 +++--
 src/lib/db/memory-table-client.ts                  |  17 ++-
 src/lib/dq/raw-store.ts                            |   4 +-
 src/lib/entities/identifiers.integration.test.ts   |  47 +++++-
 src/lib/entities/load-sec-ticker-change.test.ts    | 112 +++++++++++++--
 src/lib/entities/load-sec.ts                       | 157 +++++++++++++++------
 src/lib/research/entity-keys/parsers.test.ts       |   2 +-
 src/lib/research/entity-keys/parsers.ts            |   9 +-
 supabase/migrations.lock.json                      |   2 +-
 .../20261107090000_identifiers_and_dq.sql          |  37 +++++
 10 files changed, 350 insertions(+), 75 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show 7c22918 -- src/lib/entities/load-sec.ts scripts/entity-keys/load-sec-issuers.ts src/lib/db/memory-table-client.ts src/lib/dq/raw-store.ts src/lib/research/entity-keys/parsers.ts supabase/migrations/20261107090000_identifiers_and_dq.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-HF4QKpO6' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rWevHKXQ' (errno=Operation not permitted)
commit 7c22918a264775f0eafff54ca6b4cf3c85990147
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:26:47 2026 -0800

    fix(entities): load-sec ticker-change review (one ticker rule, rejected rows unknown, conditional close_security_absent, durable claims, single set_security_window, archived snapshots, last_seen from retained files)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/load-sec-issuers.ts b/scripts/entity-keys/load-sec-issuers.ts
index dbd6f8f..46054aa 100644
--- a/scripts/entity-keys/load-sec-issuers.ts
+++ b/scripts/entity-keys/load-sec-issuers.ts
@@ -18,10 +18,10 @@ import {readFileSync,statSync} from 'node:fs';
 import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
 import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
 import {recordAttempt} from '../../src/lib/dq/freshness';
-import {supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {RECONCILE_RAW_BUCKET,supabaseRawStore} from '../../src/lib/dq/raw-store';
 import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
-import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,loaderOutcome,planSecLoad,snapshotMetaOf,type SnapshotMeta} from '../../src/lib/entities/load-sec';
-import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange} from '../../src/lib/research/entity-keys/parsers';
+import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,lastSeenFromSnapshots,loaderOutcome,planSecLoad,snapshotMetaOf,type SnapshotMeta} from '../../src/lib/entities/load-sec';
+import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange,type SecExchangeRow} from '../../src/lib/research/entity-keys/parsers';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
 const DATASET=SEC_DATASET;
@@ -53,7 +53,7 @@ async function loadPlan(client:TableClient,file:string,asOf:string){
  const parsed=parseSecCompanyTickersExchange(bytes.toString('utf8'));
  const universeRows=await selectAll(client,'stocks_universe',{market:'US'},'ticker');
  const universe=new Set(universeRows.map(r=>String(r.ticker)));
- return {parsed,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
+ return {parsed,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
 }
 
 /** Successful (success/partial) entities.sec receipts, newest first. */
@@ -79,12 +79,18 @@ async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:strin
 const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};
 
 async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
- const {parsed,sha256,plan}=await loadPlan(client,file,asOf);
+ const {parsed,bytes,sha256,plan}=await loadPlan(client,file,asOf);
  const rows=parsed.rows.length+parsed.rejected.length;
  const prior=await priorSnapshots(client);
  const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
  if(check!=='ok'){console.error(JSON.stringify({refused:check,asOf,fetchedAt,rows,previous:prior[0]}));return 1;}
- const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows)}});
+ // Archive the exchange file by content hash BEFORE any dependent write; fail closed.
+ const admin=getAdminSupabase();
+ const raw=supabaseRawStore(admin);
+ let rawPath:string;
+ try{rawPath=(await raw.put({kind:'sec-tickers-exchange',bytes,contentType:'application/json',meta:{as_of:asOf,fetched_at:fetchedAt}})).path;}
+ catch(e){console.error(JSON.stringify({refused:'snapshot_archive_failed',message:errorMessage(e)}));return 1;}
+ const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows),raw_path:rawPath}});
  const counts=emptyCounts();
  let errors:BatchError[]=[];
  let rejected:Record<string,number>={};
@@ -92,10 +98,22 @@ async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string
  try{
   const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
   add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;
-  const raw=supabaseRawStore(getAdminSupabase());
-  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId},{
-   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256};}catch{return null;}},
-   lastSeenAsOf:async before=>prior.map(p=>p.as_of).filter(d=>d<before).sort().at(-1)??null,
+  // Retained snapshots (archived in earlier runs) are re-read to find when a ticker was last really listed.
+  const retained=new Map<string,SecExchangeRow[]|null>();
+  const rowsOf=async(path:string)=>{
+   if(!retained.has(path)){
+    try{const {data,error}=await admin.storage.from(RECONCILE_RAW_BUCKET).download(path);retained.set(path,error||!data?null:parseSecCompanyTickersExchange(await data.text()).rows);}
+    catch{retained.set(path,null);}
+   }
+   return retained.get(path)!;
+  };
+  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId,snapshotPath:rawPath,rejected:parsed.rejected},{
+   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256,path:s.main.path};}catch{return null;}},
+   lastSeenAsOf:async(cik,ticker,before)=>{
+    const snaps=[];
+    for(const p of prior)if(p.raw_path&&p.as_of<before)snaps.push({as_of:p.as_of,rows:await rowsOf(p.raw_path)});
+    return lastSeenFromSnapshots(snaps,cik,ticker,before);
+   },
   });
   // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
   changes.counts.fetched=0;
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index b4af5be..195b1ab 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,7 +8,7 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
-//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance); one synchronous JS turn stands for the row lock.
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent); one synchronous JS turn stands for the row lock.
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -95,6 +95,21 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   row.provenance={...prov,...clone(pv)};
   return 'written';
  },
+ // Review fix: conditional sec_file_absent close (pending marker must match what the run observed).
+ close_security_absent(rowsOf,a){
+  const pv=a.p_provenance;
+  if(typeof a.p_valid_to!=='string'||typeof a.p_expected_first_missing_sha256!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!('valid_to' in pv))
+   throw new TableError('rpc','close_security_absent','invalid_window_write','22023');
+  if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
+  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
+  if(!row)return 'not_found';
+  const prov=isObj(row.provenance)?row.provenance:{};
+  const pc=isObj(prov.pending_change)?prov.pending_change:{};
+  if(row.valid_to===a.p_valid_to&&row.valid_to_method==='sec_file_absent'&&'valid_to' in prov&&pc.first_missing_sha256===a.p_expected_first_missing_sha256)return 'duplicate';
+  if(row.valid_to!=null||a.p_valid_to<=String(row.valid_from)||pc.first_missing_sha256!==a.p_expected_first_missing_sha256||pc.first_missing_as_of!==a.p_valid_to)return 'conflict';
+  row.valid_to=a.p_valid_to;row.valid_to_method='sec_file_absent';row.provenance={...prov,...clone(pv)};
+  return 'written';
+ },
  // Task 6b: the only writer of provenance.pending_change; open rows only. claim_provenance_safe is not mirrored (DB suite).
  patch_security_provenance(rowsOf,a){
   const set=a.p_set,rm=a.p_remove;
diff --git a/src/lib/dq/raw-store.ts b/src/lib/dq/raw-store.ts
index 22306ac..6d3390b 100644
--- a/src/lib/dq/raw-store.ts
+++ b/src/lib/dq/raw-store.ts
@@ -12,8 +12,8 @@ import type {SupabaseClient} from '@supabase/supabase-js';
 import type {Budget} from '../facts/types';
 
 export const RECONCILE_RAW_BUCKET='reconcile-raw';
-export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo';
-export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo'];
+export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange';
+export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange'];
 export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
 export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
 export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
diff --git a/src/lib/entities/load-sec.ts b/src/lib/entities/load-sec.ts
index c74eb41..a64a097 100644
--- a/src/lib/entities/load-sec.ts
+++ b/src/lib/entities/load-sec.ts
@@ -165,14 +165,14 @@ export async function applySecLoad(client:TableClient,plan:SecLoadPlan,opts:SecA
 // ---------------------------------------------------------------- ticker-change detection (spec 3 §4.3.4)
 
 /** Previous successful snapshot, read from an entities.sec batch receipt (tool_versions). */
-export interface SnapshotMeta{as_of:string;fetched_at:string|null;rows:number|null;sha256:string|null}
+export interface SnapshotMeta{as_of:string;fetched_at:string|null;rows:number|null;sha256:string|null;/** archived raw-store path of that file, when the receipt has one */raw_path?:string}
 export type SnapshotCheck='ok'|'stale_snapshot'|'incomplete_snapshot';
 
 export function snapshotMetaOf(batch:Row):SnapshotMeta|null{
  const tv=(batch.tool_versions&&typeof batch.tool_versions==='object'?batch.tool_versions:{}) as Record<string,unknown>;
  if(typeof tv.as_of!=='string')return null;
  const rows=typeof tv.rows==='string'&&/^\d+$/.test(tv.rows)?Number.parseInt(tv.rows,10):null;
- return {as_of:tv.as_of,fetched_at:typeof tv.fetched_at==='string'?tv.fetched_at:null,rows,sha256:typeof tv.sha256==='string'?tv.sha256:null};
+ return {as_of:tv.as_of,fetched_at:typeof tv.fetched_at==='string'?tv.fetched_at:null,rows,sha256:typeof tv.sha256==='string'?tv.sha256:null,...(typeof tv.raw_path==='string'?{raw_path:tv.raw_path}:{})};
 }
 
 /** as_of and fetched_at must not go backwards; a file below 90% of the previous data rows is refused. */
@@ -185,89 +185,149 @@ export function checkSnapshot(prev:SnapshotMeta|null,cur:{as_of:string;fetched_a
 }
 
 /**
- * Tickers per CIK as the file lists them, in exact (upper-cased) and normalized form, so a stored
- * ticker matches either way; owners are indexed by the exact form only (normalization strips Wind
- * suffixes, BRK.A → BRK, which must not make another CIK look like the owner).
+ * THE SEC ticker equivalence rule (presence, ownership and the submissions confirmation all use it): a
+ * ticker's aliases are its exact upper-cased form and its normalized form (separators / - → '.', share
+ * class kept: BRK.B ≡ BRK-B; a Wind suffix is stripped, which can make an alias ambiguous: BRK.A → BRK).
  */
-export function fileTickerIndex(rows:readonly SecExchangeRow[]):{byCik:Map<string,Set<string>>;cikByTicker:Map<string,string>}{
- const byCik=new Map<string,Set<string>>(),cikByTicker=new Map<string,string>();
+export function secTickerAliases(raw:string):string[]{
+ const exact=raw.trim().toUpperCase();
+ if(!exact)return [];
+ const n=normalizeSecurityTicker(raw,'US');
+ return n&&n!==exact?[exact,n]:[exact];
+}
+export const sameSecTicker=(a:string,b:string)=>{const s=new Set(secTickerAliases(a));return secTickerAliases(b).some(x=>s.has(x));};
+
+/** Aliases per CIK, and EVERY CIK listing an alias (ambiguous aliases keep all owners). */
+export function fileTickerIndex(rows:readonly SecExchangeRow[]):{byCik:Map<string,Set<string>>;owners:Map<string,Set<string>>}{
+ const byCik=new Map<string,Set<string>>(),owners=new Map<string,Set<string>>();
  for(const r of rows){
-  const exact=r.ticker.trim().toUpperCase();
   const set=byCik.get(r.cik)??new Set<string>();
-  set.add(exact);
-  const n=normalizeSecurityTicker(r.ticker,'US');if(n)set.add(n);
+  for(const a of secTickerAliases(r.ticker)){
+   set.add(a);
+   const o=owners.get(a)??new Set<string>();o.add(r.cik);owners.set(a,o);
+  }
   byCik.set(r.cik,set);
-  if(!cikByTicker.has(exact))cikByTicker.set(exact,r.cik);
  }
- return {byCik,cikByTicker};
+ return {byCik,owners};
+}
+
+/**
+ * Identities that appear in REJECTED rows of the snapshot are UNKNOWN, not absent. A rejected row
+ * with neither a CIK nor a ticker could be anyone: then nothing is unknown-specific but `all` is set.
+ */
+export function unknownIdentities(rejected:readonly {cik?:string;ticker?:string}[]):{ciks:Set<string>;tickers:Set<string>;all:boolean}{
+ const ciks=new Set<string>(),tickers=new Set<string>();let all=false;
+ for(const r of rejected){
+  if(r.cik===undefined&&r.ticker===undefined)all=true;
+  if(r.cik!==undefined)ciks.add(r.cik);
+  if(r.ticker!==undefined)for(const a of secTickerAliases(r.ticker))tickers.add(a);
+ }
+ return {ciks,tickers,all};
+}
+
+/** Latest retained snapshot (as_of < before) that actually listed the ticker (equivalence rule) under the CIK; otherwise null. */
+export function lastSeenFromSnapshots(snapshots:readonly {as_of:string;rows:readonly SecExchangeRow[]|null}[],cik:string,ticker:string,before:string):string|null{
+ let best:string|null=null;
+ for(const s of snapshots){
+  if(!s.rows||s.as_of>=before||(best!==null&&s.as_of<=best))continue;
+  if(s.rows.some(r=>r.cik===cik&&sameSecTicker(r.ticker,ticker)))best=s.as_of;
+ }
+ return best;
 }
 
 export const CLOSE_MIN_DAYS=7;
 const DAY_MS=86_400_000;
-export interface TickerChangeInput{rows:readonly SecExchangeRow[];asOf:string;fetchedAt:string;fileSha256:string;batchId:string}
+export interface TickerChangeInput{
+ rows:readonly SecExchangeRow[];asOf:string;fetchedAt:string;fileSha256:string;batchId:string;
+ /** raw-store path of this run's archived exchange file (archived BEFORE any dependent write) */
+ snapshotPath:string;
+ /** rejected rows of this file: their CIKs/tickers are unknown, never absent */
+ rejected?:readonly {cik?:string;ticker?:string}[];
+}
 export interface TickerChangeDeps{
  /** submissions tickers[] for a CIK fetched in this run (the second source); null = SEC unavailable */
- confirm:(cik:string)=>Promise<{tickers:string[];sha256:string}|null>;
- /** as_of of the latest successful entities.sec batch strictly before `before`, or null */
- lastSeenAsOf:(before:string)=>Promise<string|null>;
+ confirm:(cik:string)=>Promise<{tickers:string[];sha256:string;path?:string}|null>;
+ /** as_of of the latest RETAINED snapshot before `before` that listed `ticker` under `cik`, or null */
+ lastSeenAsOf:(cik:string,ticker:string,before:string)=>Promise<string|null>;
 }
 export interface TickerChangeResult extends ApplyResult{pending:number;cleared:number;closed:number;claims:number}
-interface PendingChange{first_missing_as_of:string;first_missing_sha256:string;first_missing_fetched_at:string;replacement_tickers:string[];sources:string[]}
+interface PendingChange{first_missing_as_of:string;first_missing_sha256:string;first_missing_fetched_at:string;replacement_tickers:string[];sources:string[];first_missing_raw_path?:string}
 
-const patchProvenance=async(client:TableClient,issuer:string,ticker:string,validFrom:string,set:Record<string,unknown>,remove:string[])=>
- callRpc(client,'patch_security_provenance',{p_issuer:issuer,p_ticker:ticker,p_valid_from:validFrom,p_set:set,p_remove:remove});
 const pendingOf=(v:unknown):PendingChange|null=>{
  const o=(v&&typeof v==='object'?v:null) as Partial<PendingChange>|null;
  if(!o||typeof o.first_missing_as_of!=='string'||typeof o.first_missing_sha256!=='string'||typeof o.first_missing_fetched_at!=='string')return null;
  return {first_missing_as_of:o.first_missing_as_of,first_missing_sha256:o.first_missing_sha256,first_missing_fetched_at:o.first_missing_fetched_at,
-  replacement_tickers:Array.isArray(o.replacement_tickers)?o.replacement_tickers.map(String):[],sources:Array.isArray(o.sources)?o.sources.map(String):[]};
+  replacement_tickers:Array.isArray(o.replacement_tickers)?o.replacement_tickers.map(String):[],sources:Array.isArray(o.sources)?o.sources.map(String):[],
+  ...(typeof o.first_missing_raw_path==='string'?{first_missing_raw_path:o.first_missing_raw_path}:{})};
 };
+const patchProvenance=(client:TableClient,issuer:string,ticker:string,validFrom:string,set:Record<string,unknown>,remove:string[])=>
+ callRpc(client,'patch_security_provenance',{p_issuer:issuer,p_ticker:ticker,p_valid_from:validFrom,p_set:set,p_remove:remove});
+
+interface CloseEvidence{issuerId:string;cik:string;ticker:string;replacement:string[];firstMissingAsOf:string;asOf:string;closingSha256:string;closingRawPath:string|null;submissionsSha256:string|null}
+/** The evidence_only ticker-change claim of a sec_file_absent close (idempotent: fileClaim appends evidence to a pending twin). */
+async function fileCloseClaim(client:TableClient,e:CloseEvidence):Promise<boolean>{
+ const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:e.asOf,evidence_sha256:e.closingSha256,...(e.closingRawPath?{locator:e.closingRawPath}:{})};
+ const note=`观测到 ${e.ticker} 消失、${e.replacement.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
+ return fileClaim(client,{issuer_id:e.issuerId,id_type:'ticker',value:e.ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
+  schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:e.issuerId},
+  params:{suggested_op:'backdate_window',old_ticker:e.ticker,cik:e.cik,replacement_tickers:e.replacement,first_missing_as_of:e.firstMissingAsOf,...(e.submissionsSha256?{submissions_sha256:e.submissionsSha256}:{}),note},
+  evidence,sources:[evidence],
+ }});
+}
 
 /**
- * Runs after applySecLoad on the same file. For every open row with source SEC_SOURCE whose ticker
- * the file no longer lists for the issuer's CIK: first miss → provenance.pending_change; reappearance
- * → pending_change removed; close only when still missing, ≥ CLOSE_MIN_DAYS since the first miss
- * (fetched_at), a different file hash, and the CIK's submissions tickers[] no longer list it. The
- * close is an OBSERVATION bound (valid_to = first_missing_as_of, method sec_file_absent), never a
+ * Runs after applySecLoad on the same file (which must already be archived: snapshotPath). For every open row
+ * with source SEC_SOURCE whose ticker the file no longer lists for the issuer's CIK (equivalence rule
+ * secTickerAliases): first miss → provenance.pending_change; reappearance → pending_change removed; close only
+ * when still missing, ≥ CLOSE_MIN_DAYS since the first miss (fetched_at), a different file hash, and the CIK's
+ * submissions tickers[] no longer list it. Identities in rejected rows are UNKNOWN: no first miss, no close.
+ * The close is an OBSERVATION bound (valid_to = first_missing_as_of, method sec_file_absent), never a
  * ticker-change effective date: that only comes from a reviewed claim (evidence_only filed here).
+ * Concurrency guard: the close is the SQL function close_security_absent, conditional on the pending marker
+ * (first_missing_sha256 / first_missing_as_of) this run observed, so a reappearance or a concurrent run that
+ * cleared or replaced the marker turns the close into a conflict instead of a stale write.
+ * Durability: every run also files the claim of any sec_file_absent close that lacks one.
  */
 export async function detectTickerChanges(client:TableClient,input:TickerChangeInput,deps:TickerChangeDeps):Promise<TickerChangeResult>{
  const counts=emptyCounts();const errors:BatchError[]=[];const skipped:string[]=[];
  let pending=0,cleared=0,closed=0,claims=0;
- const {byCik,cikByTicker}=fileTickerIndex(input.rows);
+ const {byCik,owners}=fileTickerIndex(input.rows);
+ const unknown=unknownIdentities(input.rejected??[]);
  const open=await selectAll(client,'issuer_securities',{valid_to:null,source:SEC_SOURCE},'ticker');
  const cikCache=new Map<string,string|null>();
  const cikOf=async(issuerId:string)=>{
   if(!cikCache.has(issuerId)){const [i]=await client.select('issuers',{issuer_id:issuerId},{limit:1});cikCache.set(issuerId,i&&i.status==='active'&&typeof i.cik==='string'?i.cik:null);}
   return cikCache.get(issuerId)!;
  };
- const confirmCache=new Map<string,{tickers:string[];sha256:string}|null>();
+ const confirmCache=new Map<string,{tickers:string[];sha256:string;path?:string}|null>();
  const confirmOf=async(cik:string)=>{if(!confirmCache.has(cik))confirmCache.set(cik,await deps.confirm(cik));return confirmCache.get(cik)!;};
  for(const row of open){
   const ticker=String(row.ticker),issuerId=String(row.issuer_id),validFrom=String(row.valid_from);
   const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
   const pc=pendingOf(prov.pending_change);
+  const aliases=secTickerAliases(ticker);
   const changed=()=>{counts.failed++;errors.push({code:'row_changed',key:`${ticker}:${validFrom}`});};
   try{
    const cik=await cikOf(issuerId);
    if(!cik){skipped.push('no_cik');continue;}
-   if(byCik.get(cik)?.has(ticker)){
+   if(aliases.some(a=>byCik.get(cik)?.has(a))){
     if(prov.pending_change!==undefined){
      const out=await patchProvenance(client,issuerId,ticker,validFrom,{},['pending_change']);
      if(out==='written'){counts.versioned++;cleared++;}else if(out==='not_found')changed();
     }
     continue;
    }
-   const other=cikByTicker.get(ticker);
-   if(other!==undefined&&other!==cik){
+   if(unknown.all||unknown.ciks.has(cik)||aliases.some(a=>unknown.tickers.has(a))){skipped.push('unknown_rejected_row');continue;}
+   const otherOwners=[...new Set(aliases.flatMap(a=>[...(owners.get(a)??[])]))].filter(c=>c!==cik).sort();
+   if(otherOwners.length){
     await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${ticker}:${validFrom}`,reasonCode:'ownership_conflict',
-     detail:{reason:'ticker_listed_under_other_cik',cik:other,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:other},batchId:input.batchId},
+     detail:{reason:'ticker_listed_under_other_cik',cik:otherOwners[0],owner_ciks:otherOwners,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:otherOwners[0]},batchId:input.batchId},
      counts,errors,{code:'ownership_conflict',key:ticker});
     continue;
    }
    if(!pc){
     const replacement=open.filter(o=>String(o.issuer_id)===issuerId&&String(o.valid_from)===input.asOf&&String(o.ticker)!==ticker).map(o=>String(o.ticker)).sort();
-    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE]}});
+    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE],first_missing_raw_path:input.snapshotPath}});
     const out=await patchProvenance(client,issuerId,ticker,validFrom,set,[]);
     if(out==='written'){counts.versioned++;pending++;}else if(out==='not_found')changed();
     continue;
@@ -275,24 +335,31 @@ export async function detectTickerChanges(client:TableClient,input:TickerChangeI
    if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
    const conf=await confirmOf(cik);
    if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
-   if(conf.tickers.map(t=>t.trim().toUpperCase()).includes(ticker)){skipped.push('close_unconfirmed');continue;}
+   if(conf.tickers.some(t=>sameSecTicker(t,ticker))){skipped.push('close_unconfirmed');continue;}
    if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
-   const lastSeen=await deps.lastSeenAsOf(pc.first_missing_as_of);
+   const lastSeen=await deps.lastSeenAsOf(cik,ticker,pc.first_missing_as_of);
    const provenance=sanitizeProvenance({valid_to:{source:SEC_SOURCE,as_of:input.asOf,first_missing_as_of:pc.first_missing_as_of,first_missing_sha256:pc.first_missing_sha256,
-    closing_sha256:input.fileSha256,submissions_sha256:conf.sha256,last_seen_as_of:lastSeen}});
-   // atomic close: set_security_window merges only valid_to, so pending_change stays on the closed row
-   const closeOut=await callRpc(client,'set_security_window',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_side:'to',p_new_date:pc.first_missing_as_of,p_provenance:provenance,p_to_method:'sec_file_absent'});
+    closing_sha256:input.fileSha256,closing_raw_path:input.snapshotPath,submissions_sha256:conf.sha256,...(conf.path?{submissions_raw_path:conf.path}:{}),...(pc.first_missing_raw_path?{first_missing_raw_path:pc.first_missing_raw_path}:{}),last_seen_as_of:lastSeen}});
+   const closeOut=await callRpc(client,'close_security_absent',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_valid_to:pc.first_missing_as_of,p_expected_first_missing_sha256:pc.first_missing_sha256,p_provenance:provenance});
    if(closeOut!=='written'&&closeOut!=='duplicate'){changed();continue;}
-   counts.versioned++;closed++;
-   const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:input.asOf,evidence_sha256:input.fileSha256,locator:`cik:${cik}`};
-   const note=`观测到 ${ticker} 消失、${pc.replacement_tickers.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
-   if(await fileClaim(client,{issuer_id:issuerId,id_type:'ticker',value:ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
-    schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:issuerId},
-    params:{suggested_op:'backdate_window',old_ticker:ticker,replacement_tickers:pc.replacement_tickers,first_missing_as_of:pc.first_missing_as_of,submissions_sha256:conf.sha256,note},
-    evidence,sources:[evidence],
-   }}))claims++;
+   if(closeOut==='written'){counts.versioned++;closed++;}
+   if(await fileCloseClaim(client,{issuerId,cik,ticker,replacement:pc.replacement_tickers,firstMissingAsOf:pc.first_missing_as_of,asOf:input.asOf,closingSha256:input.fileSha256,closingRawPath:input.snapshotPath,submissionsSha256:conf.sha256}))claims++;
   }catch(e){counts.failed++;errors.push({code:'ticker_change_error',key:ticker,message:errorMessage(e)});}
  }
+ // Durable claims: a close whose claim write failed (or never ran) is repaired on any later run.
+ for(const row of await selectAll(client,'issuer_securities',{valid_to_method:'sec_file_absent',source:SEC_SOURCE},'ticker')){
+  const ticker=String(row.ticker),issuerId=String(row.issuer_id);
+  try{
+   if((await client.select('issuer_identifier_claims',{issuer_id:issuerId,id_type:'ticker',value:ticker,op:'evidence_only'},{limit:1})).length)continue;
+   const cik=await cikOf(issuerId);
+   const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
+   const vt=(prov.valid_to&&typeof prov.valid_to==='object'?prov.valid_to:{}) as Record<string,unknown>;
+   const pc=pendingOf(prov.pending_change);
+   if(!cik||typeof vt.as_of!=='string'||typeof vt.closing_sha256!=='string'||typeof vt.first_missing_as_of!=='string'){errors.push({code:'claim_repair_skipped',key:`${ticker}:${String(row.valid_from)}`});continue;}
+   if(await fileCloseClaim(client,{issuerId,cik,ticker,replacement:pc?.replacement_tickers??[],firstMissingAsOf:vt.first_missing_as_of,asOf:vt.as_of,closingSha256:vt.closing_sha256,
+    closingRawPath:typeof vt.closing_raw_path==='string'?vt.closing_raw_path:null,submissionsSha256:typeof vt.submissions_sha256==='string'?vt.submissions_sha256:null}))claims++;
+  }catch(e){counts.failed++;errors.push({code:'claim_repair_error',key:ticker,message:errorMessage(e)});}
+ }
  counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
  const skippedSummary=summarizeSkips(skipped);
  const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
diff --git a/src/lib/research/entity-keys/parsers.ts b/src/lib/research/entity-keys/parsers.ts
index b1ff426..cba7ce9 100644
--- a/src/lib/research/entity-keys/parsers.ts
+++ b/src/lib/research/entity-keys/parsers.ts
@@ -50,7 +50,8 @@ export function selectIsinsForLeis(lines: Iterable<string>, leis: Set<string>):
 export interface SecExchangeRow { cik: string; name: string; ticker: string; exchange: string }
 export interface SecExchangeParse {
   rows: SecExchangeRow[];
-  rejected: { index: number; reason: 'invalid_cik' | 'missing_ticker' | 'missing_name' }[];
+  /** cik / ticker: whatever identity the malformed row still carries (a rejected row is UNKNOWN, never absence). */
+  rejected: { index: number; reason: 'invalid_cik' | 'missing_ticker' | 'missing_name'; cik?: string; ticker?: string }[];
 }
 
 /** A CIK that normalizeCik accepts (1–10 digits, not zero; number or digit string), unpadded. */
@@ -84,11 +85,11 @@ export function parseSecCompanyTickersExchange(json: string): SecExchangeParse {
   (d.data as unknown[]).forEach((raw, index) => {
     const r = Array.isArray(raw) ? raw : [];
     const cik = secExchangeCik(r[ci]);
-    if (cik === null) { out.rejected.push({ index, reason: 'invalid_cik' }); return; }
     const ticker = nonEmpty(r[ti]);
-    if (ticker === null) { out.rejected.push({ index, reason: 'missing_ticker' }); return; }
+    if (cik === null) { out.rejected.push({ index, reason: 'invalid_cik', ...(ticker !== null ? { ticker } : {}) }); return; }
+    if (ticker === null) { out.rejected.push({ index, reason: 'missing_ticker', cik }); return; }
     const name = nonEmpty(r[ni]);
-    if (name === null) { out.rejected.push({ index, reason: 'missing_name' }); return; }
+    if (name === null) { out.rejected.push({ index, reason: 'missing_name', cik, ticker }); return; }
     const exchange = typeof r[ei] === 'string' ? (r[ei] as string).trim() : '';
     out.rows.push({ cik, name, ticker, exchange });
   });
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 721ee35..6ba7b03 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -811,6 +811,8 @@ grant execute on function public.set_security_identifier(uuid, text, date, text,
 -- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
 -- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
 -- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
+-- one function only: replays and the signature change (p_to_method) must not leave the 6-argument overload behind
+drop function if exists public.set_security_window(uuid, text, date, text, date, jsonb);
 create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb, p_to_method text default 'delisting')
 returns text language plpgsql security definer set search_path = public as $$
 declare v_row public.issuer_securities%rowtype; n int;
@@ -850,6 +852,41 @@ end $$;
 revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) from public, anon, authenticated;
 grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) to service_role;
 
+-- close_security_absent: the only writer of a sec_file_absent close (load-sec detectTickerChanges). The close is
+-- conditional on the pending marker the run observed: the row must be open AND carry pending_change with the same
+-- first_missing_sha256 and first_missing_as_of = p_valid_to, otherwise 'conflict' (a reappearance, or a concurrent
+-- run, removed or replaced the marker). ONE UPDATE sets valid_to, valid_to_method = 'sec_file_absent' and merges the
+-- valid_to provenance key (pending_change stays). Same lock order: issuer FOR SHARE -> row FOR UPDATE.
+-- Outcomes: 'written', 'duplicate' (already closed identically), 'conflict', 'not_found'.
+create or replace function public.close_security_absent(p_issuer uuid, p_ticker text, p_valid_from date, p_valid_to date, p_expected_first_missing_sha256 text, p_provenance jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare v_row public.issuer_securities%rowtype; n int;
+begin
+  if p_ticker is null or p_valid_from is null or p_valid_to is null or p_expected_first_missing_sha256 is null
+     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
+     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_to']
+     or not public.claim_provenance_safe(p_provenance) then
+    raise exception 'invalid_window_write' using errcode = '22023';
+  end if;
+  perform 1 from public.issuers where issuer_id = p_issuer for share;
+  if not found then return 'not_found'; end if;
+  select * into v_row from public.issuer_securities s
+  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from for update;
+  if not found then return 'not_found'; end if;
+  if v_row.valid_to = p_valid_to and v_row.valid_to_method = 'sec_file_absent' and v_row.provenance ? 'valid_to'
+     and v_row.provenance->'pending_change'->>'first_missing_sha256' = p_expected_first_missing_sha256 then return 'duplicate'; end if;
+  if v_row.valid_to is not null or p_valid_to <= v_row.valid_from
+     or v_row.provenance->'pending_change'->>'first_missing_sha256' is distinct from p_expected_first_missing_sha256
+     or v_row.provenance->'pending_change'->>'first_missing_as_of' is distinct from p_valid_to::text then return 'conflict'; end if;
+  update public.issuer_securities set valid_to = p_valid_to, valid_to_method = 'sec_file_absent', provenance = provenance || p_provenance
+  where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+  get diagnostics n = row_count;
+  if n <> 1 then return 'conflict'; end if;
+  return 'written';
+end $$;
+revoke execute on function public.close_security_absent(uuid, text, date, date, text, jsonb) from public, anon, authenticated;
+grant execute on function public.close_security_absent(uuid, text, date, date, text, jsonb) to service_role;
+
 -- patch_security_provenance: the only writer of provenance.pending_change (load-sec ticker-change detection, Task 6b).
 -- Lock order issuer FOR SHARE -> row FOR UPDATE; open rows only; both p_set and p_remove limited to the key pending_change.
 -- ONE UPDATE: provenance = (provenance - p_remove) || p_set. Outcomes: 'written', 'duplicate' (no change), 'not_found'.

exec
/bin/zsh -lc "find . -iname '*agents*' -not -path './node_modules/*' -not -path './.git/*'; cat src/lib/entities/claims.ts 2>/dev/null; rg 'function fileClaim|normalizeSecurityTicker' src/lib/entities -n; git show 7c22918 -- src/lib/entities/load-sec-ticker-change.test.ts; cat src/lib/dq/raw-store.ts | head -160; cat scripts/entity-keys/load-sec-issuers.ts | tail -75" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 60ms:
./.claude/agents
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
src/lib/entities/submissions-evidence.ts:9:import {normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/submissions-evidence.ts:37:  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
src/lib/entities/link-research.ts:14:import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/link-research.ts:80: if(s.market!=='other')return {ticker:normalizeSecurityTicker(s.exchange_code,s.market),market:s.market};
src/lib/entities/link-research.ts:81: return {ticker:(market&&normalizeSecurityTicker(s.exchange_code,market))||s.exchange_code.trim().toUpperCase(),market};
src/lib/entities/load-sec.ts:16:import {normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/load-sec.ts:35: const normalized=normalizeSecurityTicker(raw,'US');
src/lib/entities/load-sec.ts:195: const n=normalizeSecurityTicker(raw,'US');
src/lib/entities/identifiers/openfigi.ts:13:import {normalizeSecurityTicker} from '../../securities/ticker';
src/lib/entities/identifiers/openfigi.ts:198: if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
src/lib/entities/identifiers/openfigi.ts:199: if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
src/lib/entities/claims.ts:179:export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
src/lib/entities/resolve.ts:15:import {inferCoreMarket,normalizeSecurityTicker} from '../securities/ticker';
src/lib/entities/resolve.ts:73: const normalized=(market&&normalizeSecurityTicker(raw,market))||exact;
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PANaI3nN' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FyjYohh0' (errno=Operation not permitted)
commit 7c22918a264775f0eafff54ca6b4cf3c85990147
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:26:47 2026 -0800

    fix(entities): load-sec ticker-change review (one ticker rule, rejected rows unknown, conditional close_security_absent, durable claims, single set_security_window, archived snapshots, last_seen from retained files)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/load-sec-ticker-change.test.ts b/src/lib/entities/load-sec-ticker-change.test.ts
index b8ce7ab..78ebb57 100644
--- a/src/lib/entities/load-sec-ticker-change.test.ts
+++ b/src/lib/entities/load-sec-ticker-change.test.ts
@@ -5,7 +5,9 @@
 import {describe,it,expect} from 'vitest';
 import {memoryTableClient} from '../db/memory-table-client';
 import type {SecExchangeRow} from '../research/entity-keys/parsers';
-import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,planSecLoad,snapshotMetaOf,type TickerChangeDeps} from './load-sec';
+import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,lastSeenFromSnapshots,planSecLoad,sameSecTicker,snapshotMetaOf,unknownIdentities,type TickerChangeDeps} from './load-sec';
+import {parseSecCompanyTickersExchange} from '../research/entity-keys/parsers';
+import type {Row,TableClient} from '../db/table-client';
 import {resolveIssuer} from './resolve';
 
 const T0='2026-11-01',T1='2026-11-02',T2='2026-11-09',T3='2026-11-20';
@@ -13,13 +15,14 @@ const F=(d:string)=>`${d}T06:00:00.000Z`;
 const H=(c:string)=>c.repeat(64);
 const BATCH='33333333-3333-4333-8333-333333333333';
 const CIK='1000001',OTHER='1000002';
-const UNIVERSE=new Set(['OLD','NEW']);
+const UNIVERSE=new Set(['OLD','NEW','BRK.B','BRK.A']);
+const snap=(sha:string)=>`sec-tickers-exchange/${sha}.json`;
 const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
 const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
 const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
-async function run(c:ReturnType<typeof memoryTableClient>,rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW'])){
+async function run(c:TableClient&{rows(t:string):Row[]},rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW']),rejected:{cik?:string;ticker?:string}[]=[],lastSeen:TickerChangeDeps['lastSeenAsOf']=async()=>T0){
  await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
- return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH},{confirm,lastSeenAsOf:async()=>T0});
+ return detectTickerChanges(c,{rows,asOf,fetchedAt:F(asOf),fileSha256:fileSha,batchId:BATCH,snapshotPath:snap(fileSha),rejected},{confirm,lastSeenAsOf:lastSeen});
 }
 const issuerOf=(c:ReturnType<typeof memoryTableClient>,cik:string)=>String(c.rows('issuers').find(x=>x.cik===cik)!.issuer_id);
 const rowOf=(c:ReturnType<typeof memoryTableClient>,ticker:string,validFrom?:string)=>c.rows('issuer_securities').find(x=>x.ticker===ticker&&(validFrom===undefined||x.valid_from===validFrom))!;
@@ -41,10 +44,12 @@ describe('snapshot gating',()=>{
   expect(snapshotMetaOf({tool_versions:{}})).toBeNull();
  });
  it('indexes file tickers per CIK in exact and normalized form, owners by exact form only',()=>{
-  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW')]);
-  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK-B','BRK.B']);
-  expect(ix.cikByTicker.get('BRK-B')).toBe(CIK);expect(ix.cikByTicker.has('BRK.B')).toBe(false);
-  expect(ix.cikByTicker.get('NEW')).toBe(OTHER);
+  const ix=fileTickerIndex([r(CIK,'BRK-B'),r(OTHER,'NEW'),r(OTHER,'BRK.A'),r(CIK,'BRK.A')]);
+  expect([...ix.byCik.get(CIK)!].sort()).toEqual(['BRK','BRK-B','BRK.A','BRK.B']);
+  expect([...ix.owners.get('BRK.B')!]).toEqual([CIK]);expect([...ix.owners.get('BRK-B')!]).toEqual([CIK]);
+  expect([...ix.owners.get('NEW')!]).toEqual([OTHER]);
+  expect([...ix.owners.get('BRK')!].sort()).toEqual([CIK,OTHER]);     // ambiguous alias keeps every owner
+  expect(sameSecTicker('BRK.B','brk-b')).toBe(true);expect(sameSecTicker('BRK.B','BRK.A')).toBe(false);
  });
 });
 
@@ -57,13 +62,13 @@ describe('detectTickerChanges (spec §4.3.4 fixture, E3)',()=>{
   const t1=await run(c,[r(CIK,'NEW')],T1,H('1'));
   expect(t1.pending).toBe(1);
   expect(rowOf(c,'OLD').valid_to).toBeNull();
-  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']});
+  expect(prov(rowOf(c,'OLD')).pending_change).toEqual({first_missing_as_of:T1,first_missing_sha256:H('1'),first_missing_fetched_at:F(T1),replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange'],first_missing_raw_path:snap(H('1'))});
   expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T1}))?.issuer_id).toBe(x);
   const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
   expect(t2.closed).toBe(1);
   const old=rowOf(c,'OLD');
   expect(old).toMatchObject({valid_from:T0,valid_to:T1,valid_to_method:'sec_file_absent'});
-  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),submissions_sha256:H('e'),last_seen_as_of:T0});
+  expect(prov(old).valid_to).toEqual({source:'sec_company_tickers_exchange',as_of:T2,first_missing_as_of:T1,first_missing_sha256:H('1'),closing_sha256:H('2'),closing_raw_path:snap(H('2')),first_missing_raw_path:snap(H('1')),submissions_sha256:H('e'),last_seen_as_of:T0});
   expect(prov(old).pending_change).toMatchObject({replacement_tickers:['NEW']});
   expect(await resolveIssuer(c,{ticker:'OLD'},{asOf:T1})).toBeNull();
   expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T0}))?.issuer_id).toBe(x);
@@ -122,3 +127,90 @@ describe('detectTickerChanges (spec §4.3.4 fixture, E3)',()=>{
   expect((await resolveIssuer(c,{ticker:'OLD'},{asOf:T3}))?.issuer_id).toBe(issuerOf(c,CIK));
  });
 });
+
+describe('review fixes',()=>{
+ const miss=async(c:ReturnType<typeof memoryTableClient>,ticker:string,extra:Partial<{confirm:TickerChangeDeps['confirm'];rejected:{cik?:string;ticker?:string}[]}>={})=>{
+  await run(c,[r(CIK,ticker)],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'),confirmed(['NEW']),extra.rejected);
+  return run(c,[r(CIK,'NEW')],T2,H('2'),extra.confirm??confirmed(['NEW']),extra.rejected);
+ };
+ it('P1 one ticker rule: submissions listing BRK-B prevents closing BRK.B',async()=>{
+  const c=memoryTableClient(KEYS);
+  const t2=await miss(c,'BRK.B',{confirm:confirmed(['NEW','BRK-B'])});
+  expect(t2.skippedSummary).toMatchObject({close_unconfirmed:1});
+  expect(rowOf(c,'BRK.B').valid_to).toBeNull();
+ });
+ it('P1 one ticker rule: the file listing BRK-B for the same CIK is presence for BRK.B',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'BRK.B')],T0,H('0'));
+  const t1=await run(c,[r(CIK,'BRK-B')],T1,H('1'));
+  expect(t1.pending).toBe(0);expect(prov(rowOf(c,'BRK.B')).pending_change).toBeUndefined();
+ });
+ it('P1 another CIK owning BRK-B is an ownership_conflict for BRK.B',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'BRK.B')],T0,H('0'));
+  await run(c,[r(OTHER,'BRK-B'),r(CIK,'NEW')],T1,H('1'));
+  expect(c.rows('dq_quarantine').some(q=>q.natural_key===`BRK.B:${T0}`&&q.reason_code==='ownership_conflict')).toBe(true);
+  expect(prov(rowOf(c,'BRK.B')).pending_change).toBeUndefined();
+ });
+ it('P1 rejected rows are unknown, not absence: no first miss for their CIK or ticker',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  const bad=parseSecCompanyTickersExchange(JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[Number(CIK),'','OLD','Nasdaq']]}));
+  expect(bad.rejected).toEqual([{index:0,reason:'missing_name',cik:CIK,ticker:'OLD'}]);
+  const t1=await run(c,[r(OTHER,'NEW')],T1,H('1'),confirmed(['NEW']),bad.rejected);
+  expect(t1.pending).toBe(0);expect(t1.skippedSummary).toMatchObject({unknown_rejected_row:1});
+  expect(prov(rowOf(c,'OLD')).pending_change).toBeUndefined();
+  // a row that cannot be identified at all makes every absence unknown
+  const t1b=await run(c,[r(OTHER,'NEW')],T1,H('1'),confirmed(['NEW']),[{}]);
+  expect(t1b.pending).toBe(0);
+  expect(unknownIdentities([{ticker:'BRK-B'}]).tickers.has('BRK.B')).toBe(true);
+ });
+ it('P1 a rejected row also blocks the close of a pending change',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW']),[{cik:CIK}]);
+  expect(t2.closed).toBe(0);expect(rowOf(c,'OLD').valid_to).toBeNull();
+ });
+ it('P2 durable claim: a claim write that fails after the close is filed by the next run',async()=>{
+  const mem=memoryTableClient(KEYS);
+  let fail=true;
+  const c=new Proxy(mem,{get(t,k,rcv){
+   if(k==='insert')return async(table:string,row:Row)=>{if(fail&&table==='issuer_identifier_claims')throw new Error('boom');return t.insert(table,row);};
+   const v=Reflect.get(t,k,rcv);return typeof v==='function'?v.bind(t):v;
+  }}) as unknown as typeof mem;
+  await run(mem,[r(CIK,'OLD')],T0,H('0'));
+  await run(mem,[r(CIK,'NEW')],T1,H('1'));
+  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'));
+  expect(rowOf(mem,'OLD').valid_to).toBe(T1);expect(mem.rows('issuer_identifier_claims')).toEqual([]);
+  expect(t2.errors.map(e=>e.code)).toContain('ticker_change_error');
+  fail=false;
+  const t3=await run(c,[r(CIK,'NEW')],T3,H('5'));
+  expect(t3.claims).toBe(1);
+  expect(mem.rows('issuer_identifier_claims').map(k=>[k.op,k.id_type,k.value])).toEqual([['evidence_only','ticker','OLD']]);
+  const t4=await run(c,[r(CIK,'NEW')],'2026-11-21',H('6'));
+  expect(t4.claims).toBe(0);expect(mem.rows('issuer_identifier_claims')).toHaveLength(1);
+ });
+ it('P2 the snapshot path is recorded in the pending marker, the close provenance and the claim',async()=>{
+  const c=memoryTableClient(KEYS);
+  await miss(c,'OLD');
+  expect(prov(rowOf(c,'OLD')).valid_to).toMatchObject({closing_raw_path:snap(H('2')),first_missing_raw_path:snap(H('1'))});
+  expect((c.rows('issuer_identifier_claims')[0].detail as {evidence:{locator:string}}).evidence.locator).toBe(snap(H('2')));
+ });
+ it('P2 last_seen_as_of comes only from a retained snapshot that listed the ticker for that CIK',async()=>{
+  const rowsA=[r(CIK,'OLD')],rowsB=[r(OTHER,'OLD')],rowsC=[r(CIK,'NEW')];
+  const snaps=[{as_of:T0,rows:rowsA},{as_of:T1,rows:rowsC},{as_of:'2026-10-01',rows:rowsB},{as_of:'2026-09-01',rows:null}];
+  expect(lastSeenFromSnapshots(snaps,CIK,'OLD',T2)).toBe(T0);
+  expect(lastSeenFromSnapshots(snaps,OTHER,'OLD',T2)).toBe('2026-10-01');
+  expect(lastSeenFromSnapshots(snaps,CIK,'NEW',T1)).toBeNull();
+  expect(lastSeenFromSnapshots([{as_of:T0,rows:null}],CIK,'OLD',T2)).toBeNull();
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const seen:string[][]=[];
+  await run(c,[r(CIK,'NEW')],T2,H('2'),confirmed(['NEW']),[],async(cik,t,b)=>{seen.push([cik,t,b]);return null;});
+  expect(seen).toEqual([[CIK,'OLD',T1]]);
+  expect(prov(rowOf(c,'OLD')).valid_to!.last_seen_as_of).toBeNull();
+ });
+});
// src/lib/dq/raw-store.ts
// Raw evidence for identifiers, calendar and reconciliation (spec 3 §3.1 bucket reconcile-raw; plan 3
// contract C6). Content-addressed: put() hashes the bytes itself and stores them at
// <kind>/<sha256>.<ext> plus a <kind>/<sha256>.meta.json sidecar, both with upsert:false, so identical
// bytes fetched again answer 'exists' and stored evidence is never rewritten (the first sidecar wins).
// The sidecar holds metadata only: values that look like credentials (URL userinfo, token-like query
// parameters) are refused before any upload. Any other upload failure is
// RawStoreError('raw_upload_failed'): the caller marks that issuer/file failed and writes no row that
// depends on it. The budget's abort signal cuts the wait. Mirrors src/lib/facts/snapshot-store.ts.
import {createHash} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Budget} from '../facts/types';

export const RECONCILE_RAW_BUCKET='reconcile-raw';
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange'];
export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
export interface RawStore{put(item:RawPut,budget?:Budget):Promise<RawStored>;sha256Of(path:string):string}
export const RAW_EXT:Record<RawContentType,string>={
 'application/json':'json','text/html':'html','application/pdf':'pdf','text/csv':'csv',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-excel':'xls','application/zip':'zip',
};
export const rawPath=(kind:RawKind,sha256:string,ext:string)=>`${kind}/${sha256}.${ext}`;
// Full object filename + .meta.json: the same bytes stored under two content types get distinct sidecars.
export const rawMetaPath=(path:string)=>`${path}.meta.json`;

export class RawStoreError extends Error{
 constructor(readonly code:'raw_upload_failed'|'raw_invalid',readonly reason?:string){
  super(reason?`${code}: ${reason}`:code);
  this.name='RawStoreError';
 }
}

const PATH=new RegExp(`^(${RAW_KINDS.join('|')})/([0-9a-f]{64})\\.(${Object.values(RAW_EXT).join('|')})$`);
const CREDENTIAL=/:\/\/[^/\s]*@|[?&#](?:token|key|apikey|api_key|access_token|sig|signature|auth|secret|password)=/i;
const CREDENTIAL_NAME=/api[-_]?key|token|secret|password|authorization|cookie|^(?:key|sig|signature|auth)$/i;
/** A string value that parses as a URL is also checked by its decoded query/fragment parameter names and userinfo. */
function urlHasCredential(v:string):boolean{
 let u:URL;
 try{u=new URL(v);}catch{return false;}
 if(u.username||u.password)return true;
 for(const name of u.searchParams.keys())if(CREDENTIAL_NAME.test(name))return true;
 const frag=u.hash.replace(/^#/,'');
 if(frag.includes('='))for(const name of new URLSearchParams(frag).keys())if(CREDENTIAL_NAME.test(name))return true;
 return false;
}

export const sha256Hex=(bytes:Uint8Array):string=>createHash('sha256').update(bytes).digest('hex');

/** The sha256 a content-addressed data path names; throws raw_invalid for anything else (sidecars included). */
function sha256Of(path:string):string{
 const m=PATH.exec(path);
 if(!m)throw new RawStoreError('raw_invalid',`path:${path.slice(0,80)}`);
 return m[2];
}

function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
 if(!RAW_KINDS.includes(item.kind))throw new RawStoreError('raw_invalid',`kind:${String(item.kind).slice(0,40)}`);
 const ext=RAW_EXT[item.contentType];
 if(!ext)throw new RawStoreError('raw_invalid',`content_type:${String(item.contentType).slice(0,80)}`);
 if(!(item.bytes instanceof Uint8Array))throw new RawStoreError('raw_invalid','bytes');
 for(const [k,v] of Object.entries(item.meta??{})){
  if(typeof v==='number'?!Number.isFinite(v):typeof v!=='string')throw new RawStoreError('raw_invalid',`meta:${k}`);
  if(CREDENTIAL_NAME.test(k))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
  if(typeof v==='string'&&(CREDENTIAL.test(v)||urlHasCredential(v)))throw new RawStoreError('raw_invalid',`meta_credential:${k}`);
 }
 const sha256=sha256Hex(item.bytes);
 // System keys last: caller meta can never overwrite what the sidecar asserts about the bytes.
 const meta=JSON.stringify({...item.meta,kind:item.kind,sha256,bytes:item.bytes.byteLength,content_type:item.contentType});
 return {sha256,path:rawPath(item.kind,sha256,ext),meta};
}

interface UploadError{message:string;statusCode?:string|number;status?:number}
const isExists=(e:UploadError)=>String(e.statusCode??e.status??'')==='409'||/already exists|duplicate/i.test(e.message);

function withinBudget<T>(p:Promise<T>,budget?:Budget):Promise<T>{
 if(!budget)return p;
 if(budget.signal.aborted)return Promise.reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
 return new Promise<T>((resolve,reject)=>{
  const onAbort=()=>reject(new RawStoreError('raw_upload_failed','budget_exhausted'));
  budget.signal.addEventListener('abort',onAbort,{once:true});
  p.then(v=>{budget.signal.removeEventListener('abort',onAbort);resolve(v);},e=>{budget.signal.removeEventListener('abort',onAbort);reject(e);});
 });
}

export function supabaseRawStore(admin:SupabaseClient):RawStore{
 const bucket=()=>admin.storage.from(RECONCILE_RAW_BUCKET);
 const upload=async(path:string,body:Uint8Array|string,contentType:string,budget?:Budget):Promise<'stored'|'exists'>=>{
  // checked before the call: an already-aborted budget performs zero uploads
  if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
  const {error}=await withinBudget(bucket().upload(path,body,{contentType,upsert:false}),budget);
  if(!error)return 'stored';
  if(isExists(error as UploadError))return 'exists';
  throw new RawStoreError('raw_upload_failed',(error as UploadError).message);
 };
 return {
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   const status=await upload(path,item.bytes,item.contentType,budget);
   await upload(rawMetaPath(path),meta,'application/json',budget);
   return {sha256,path,status};
  },
 };
}

export function memoryRawStore():RawStore&{objects:Map<string,Uint8Array>}{
 const objects=new Map<string,Uint8Array>();
 return {
  objects,
  sha256Of,
  async put(item,budget){
   const {sha256,path,meta}=prepare(item);
   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   // a copy: later mutation of the caller's buffer cannot rewrite evidence; stored objects and sidecars are immutable
   const status:RawStored['status']=objects.has(path)?'exists':'stored';
   if(status==='stored')objects.set(path,new Uint8Array(item.bytes));
   if(!objects.has(rawMetaPath(path)))objects.set(rawMetaPath(path),new TextEncoder().encode(meta));
   return {sha256,path,status};
  },
 };
}
async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:string|null){
 const {parsed,sha256,universeSize,plan}=await loadPlan(client,file,asOf);
 const prev=(await priorSnapshots(client))[0]??null;
 const rows=parsed.rows.length+parsed.rejected.length;
 console.log(JSON.stringify({
  mode:'dry-run (no ingest batch written; pass --apply --fetched-at <ISO> to write)',asOf,sha256,rows,
  snapshotCheck:fetchedAt?checkSnapshot(prev,{as_of:asOf,fetched_at:fetchedAt,rows}):'needs --fetched-at',previous:prev,
  parsed:parsed.rows.length,rejected:parsed.rejected.length,universe:universeSize,
  issuers:plan.issuers.length,securities:plan.securities.length,skipped:plan.skipped.length,
  firstSkipped:plan.skipped.slice(0,10),firstRejected:parsed.rejected.slice(0,10),
 },null,1));
}

const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};

async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
 const {parsed,bytes,sha256,plan}=await loadPlan(client,file,asOf);
 const rows=parsed.rows.length+parsed.rejected.length;
 const prior=await priorSnapshots(client);
 const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
 if(check!=='ok'){console.error(JSON.stringify({refused:check,asOf,fetchedAt,rows,previous:prior[0]}));return 1;}
 // Archive the exchange file by content hash BEFORE any dependent write; fail closed.
 const admin=getAdminSupabase();
 const raw=supabaseRawStore(admin);
 let rawPath:string;
 try{rawPath=(await raw.put({kind:'sec-tickers-exchange',bytes,contentType:'application/json',meta:{as_of:asOf,fetched_at:fetchedAt}})).path;}
 catch(e){console.error(JSON.stringify({refused:'snapshot_archive_failed',message:errorMessage(e)}));return 1;}
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows),raw_path:rawPath}});
 const counts=emptyCounts();
 let errors:BatchError[]=[];
 let rejected:Record<string,number>={};
 let status:BatchStatus='failed';
 try{
  const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;
  // Retained snapshots (archived in earlier runs) are re-read to find when a ticker was last really listed.
  const retained=new Map<string,SecExchangeRow[]|null>();
  const rowsOf=async(path:string)=>{
   if(!retained.has(path)){
    try{const {data,error}=await admin.storage.from(RECONCILE_RAW_BUCKET).download(path);retained.set(path,error||!data?null:parseSecCompanyTickersExchange(await data.text()).rows);}
    catch{retained.set(path,null);}
   }
   return retained.get(path)!;
  };
  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId,snapshotPath:rawPath,rejected:parsed.rejected},{
   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256,path:s.main.path};}catch{return null;}},
   lastSeenAsOf:async(cik,ticker,before)=>{
    const snaps=[];
    for(const p of prior)if(p.raw_path&&p.as_of<before)snaps.push({as_of:p.as_of,rows:await rowsOf(p.raw_path)});
    return lastSeenFromSnapshots(snaps,cik,ticker,before);
   },
  });
  // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
  changes.counts.fetched=0;
  add(counts,changes.counts);errors=[...errors,...changes.errors];
 }catch(e){
  errors=[...errors,{code:'exception',message:errorMessage(e)}];
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts,rejected);
 await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 return outcome.exitCode;
}

async function main(){
 const {file,apply:doApply,asOf,fetchedAt}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,file,asOf,fetchedAt);return;}
 process.exitCode=await apply(client,file,asOf,fetchedAt!);
}

main().catch(e=>{console.error(errorMessage(e));process.exit(1);});

codex
The new recovery path can silently omit closing evidence, and the retained-snapshot search can lose available last-seen dates because it uses a capped receipt history.

Full review comments:

- [P2] Verify closing evidence before skipping claim repair — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:353-353
  If a ticker already has an unrelated or previously resolved `evidence_only` claim, this lookup skips repair even when the claim write for the current close failed. It matches neither the closing snapshot hash nor the disappearance date, so the new close's evidence can remain permanently absent from the review queue. Check whether the specific closing evidence was persisted, and append or file it when missing.

- [P2] Search beyond the capped receipt list for last-seen evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/entity-keys/load-sec-issuers.ts:115-119
  `priorSnapshots()` retrieves only the latest 50 receipts per status. If closure is deferred long enough—for example, because submissions confirmation is unavailable—the snapshot that last listed the ticker can fall outside that list despite remaining archived. This search then records `last_seen_as_of: null` instead of the actual retained observation. Paginate older receipts when searching for the last matching snapshot rather than reusing the capped freshness-check list.
The new recovery path can silently omit closing evidence, and the retained-snapshot search can lose available last-seen dates because it uses a capped receipt history.

Full review comments:

- [P2] Verify closing evidence before skipping claim repair — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/load-sec.ts:353-353
  If a ticker already has an unrelated or previously resolved `evidence_only` claim, this lookup skips repair even when the claim write for the current close failed. It matches neither the closing snapshot hash nor the disappearance date, so the new close's evidence can remain permanently absent from the review queue. Check whether the specific closing evidence was persisted, and append or file it when missing.

- [P2] Search beyond the capped receipt list for last-seen evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/entity-keys/load-sec-issuers.ts:115-119
  `priorSnapshots()` retrieves only the latest 50 receipts per status. If closure is deferred long enough—for example, because submissions confirmation is unavailable—the snapshot that last listed the ticker can fall outside that list despite remaining archived. This search then records `last_seen_as_of: null` instead of the actual retained observation. Paginate older receipts when searching for the last matching snapshot rather than reusing the capped freshness-check list.

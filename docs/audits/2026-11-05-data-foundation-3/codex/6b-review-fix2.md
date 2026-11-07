OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b034-77da-7411-9429-200ca3ce0658
--------
user
commit 6b4e252
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 6b4e252; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 525ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-F6tXjxaC' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-g5gV3eHB' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-88WwLQJY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PNS7vFOn' (errno=Operation not permitted)
6b4e252 fix(entities): load-sec round 2 (set_security_window delisting only, refusal receipts, close-specific claim repair, full receipt pagination, cadence/unavailable/skipped)
 scripts/entity-keys/load-sec-issuers.ts            | 52 ++++++++-------
 src/lib/db/memory-table-client.ts                  |  4 +-
 src/lib/entities/identifiers.integration.test.ts   | 16 +++--
 src/lib/entities/load-sec-ticker-change.test.ts    | 78 +++++++++++++++++++++-
 src/lib/entities/load-sec.ts                       | 55 +++++++++++++--
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 18 ++---
 7 files changed, 175 insertions(+), 50 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show 6b4e252 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Rsm4gi2H' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-vOCdSfXz' (errno=Operation not permitted)
commit 6b4e252cd2420d5d8ae8c671636122ef7300582e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:32:55 2026 -0800

    fix(entities): load-sec round 2 (set_security_window delisting only, refusal receipts, close-specific claim repair, full receipt pagination, cadence/unavailable/skipped)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/load-sec-issuers.ts b/scripts/entity-keys/load-sec-issuers.ts
index 46054aa..8d8a664 100644
--- a/scripts/entity-keys/load-sec-issuers.ts
+++ b/scripts/entity-keys/load-sec-issuers.ts
@@ -15,12 +15,13 @@
  */
 import {createHash} from 'node:crypto';
 import {readFileSync,statSync} from 'node:fs';
-import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
+import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
 import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {inventoryEntry} from '../../src/lib/dq/datasets';
 import {recordAttempt} from '../../src/lib/dq/freshness';
 import {RECONCILE_RAW_BUCKET,supabaseRawStore} from '../../src/lib/dq/raw-store';
 import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
-import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,lastSeenFromSnapshots,loaderOutcome,planSecLoad,snapshotMetaOf,type SnapshotMeta} from '../../src/lib/entities/load-sec';
+import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,lastSeenInReceipts,loaderOutcome,planSecLoad,priorSnapshots,recordRefusal} from '../../src/lib/entities/load-sec';
 import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange,type SecExchangeRow} from '../../src/lib/research/entity-keys/parsers';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
@@ -56,16 +57,9 @@ async function loadPlan(client:TableClient,file:string,asOf:string){
  return {parsed,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
 }
 
-/** Successful (success/partial) entities.sec receipts, newest first. */
-async function priorSnapshots(client:TableClient):Promise<SnapshotMeta[]>{
- const rows:Row[]=[];
- for(const status of ['success','partial'])rows.push(...await client.select('ingest_batches',{dataset:DATASET,status},{orderBy:'started_at',desc:true,limit:50}));
- return rows.sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at))).map(snapshotMetaOf).filter((m):m is SnapshotMeta=>m!==null);
-}
-
 async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:string|null){
  const {parsed,sha256,universeSize,plan}=await loadPlan(client,file,asOf);
- const prev=(await priorSnapshots(client))[0]??null;
+ const prev=(await priorSnapshots(client,DATASET))[0]??null;
  const rows=parsed.rows.length+parsed.rejected.length;
  console.log(JSON.stringify({
   mode:'dry-run (no ingest batch written; pass --apply --fetched-at <ISO> to write)',asOf,sha256,rows,
@@ -78,27 +72,40 @@ async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:strin
 
 const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};
 
+/** Every refusal leaves a rejected batch + a failed freshness attempt, then exits 1. */
+async function refuse(client:TableClient,file:string,asOf:string,fetchedAt:string,code:string,detail:Record<string,unknown>={}):Promise<1>{
+ console.error(JSON.stringify({refused:code,asOf,fetchedAt,...detail}));
+ try{await recordRefusal(client,{dataset:DATASET,cadence:inventoryEntry(DATASET).cadence,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt},code,message:typeof detail.message==='string'?detail.message:undefined});}
+ catch(e){console.error(`refusal receipt failed: ${errorMessage(e)}`);}
+ return 1;
+}
+const REFUSAL_CODES=['file_too_large','too_many_rows','invalid_sec_exchange_file'];
+
 async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
- const {parsed,bytes,sha256,plan}=await loadPlan(client,file,asOf);
+ let loaded:Awaited<ReturnType<typeof loadPlan>>;
+ try{loaded=await loadPlan(client,file,asOf);}
+ catch(e){const m=errorMessage(e);return refuse(client,file,asOf,fetchedAt,REFUSAL_CODES.includes(m)?m:'load_failed',{message:m});}
+ const {parsed,bytes,sha256,plan}=loaded;
  const rows=parsed.rows.length+parsed.rejected.length;
- const prior=await priorSnapshots(client);
+ const prior=await priorSnapshots(client,DATASET);
  const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
- if(check!=='ok'){console.error(JSON.stringify({refused:check,asOf,fetchedAt,rows,previous:prior[0]}));return 1;}
+ if(check!=='ok')return refuse(client,file,asOf,fetchedAt,check,{rows,previous:prior[0]});
  // Archive the exchange file by content hash BEFORE any dependent write; fail closed.
  const admin=getAdminSupabase();
  const raw=supabaseRawStore(admin);
  let rawPath:string;
  try{rawPath=(await raw.put({kind:'sec-tickers-exchange',bytes,contentType:'application/json',meta:{as_of:asOf,fetched_at:fetchedAt}})).path;}
- catch(e){console.error(JSON.stringify({refused:'snapshot_archive_failed',message:errorMessage(e)}));return 1;}
+ catch(e){return refuse(client,file,asOf,fetchedAt,'snapshot_archive_failed',{message:errorMessage(e)});}
  const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows),raw_path:rawPath}});
  const counts=emptyCounts();
  let errors:BatchError[]=[];
  let rejected:Record<string,number>={};
+ let skipped:Record<string,number>={};
  let status:BatchStatus='failed';
  try{
   const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
-  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;
-  // Retained snapshots (archived in earlier runs) are re-read to find when a ticker was last really listed.
+  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;skipped={...loaded.skippedSummary};
+  // Retained snapshots (archived in earlier runs) are re-read, newest first and across ALL receipts, to find when a ticker was last really listed.
   const retained=new Map<string,SecExchangeRow[]|null>();
   const rowsOf=async(path:string)=>{
    if(!retained.has(path)){
@@ -108,16 +115,13 @@ async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string
    return retained.get(path)!;
   };
   const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId,snapshotPath:rawPath,rejected:parsed.rejected},{
-   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256,path:s.main.path};}catch{return null;}},
-   lastSeenAsOf:async(cik,ticker,before)=>{
-    const snaps=[];
-    for(const p of prior)if(p.raw_path&&p.as_of<before)snaps.push({as_of:p.as_of,rows:await rowsOf(p.raw_path)});
-    return lastSeenFromSnapshots(snaps,cik,ticker,before);
-   },
+   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256,path:s.main.path};}catch(e){return {unavailable:errorMessage(e)};}},
+   lastSeenAsOf:(cik,ticker,before)=>lastSeenInReceipts(prior,rowsOf,cik,ticker,before),
   });
   // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
   changes.counts.fetched=0;
   add(counts,changes.counts);errors=[...errors,...changes.errors];
+  for(const [k,v] of Object.entries(changes.skippedSummary))skipped[k]=(skipped[k]??0)+v;
  }catch(e){
   errors=[...errors,{code:'exception',message:errorMessage(e)}];
  }finally{
@@ -125,8 +129,8 @@ async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string
   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
  }
  const outcome=loaderOutcome(status,counts,rejected);
- await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:'event'});
- console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
+ await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:inventoryEntry(DATASET).cadence});
+ console.log(JSON.stringify({batchId,status,counts,skipped,rejected,errors:errors.slice(0,20)},null,1));
  return outcome.exitCode;
 }
 
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 195b1ab..82235c4 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -75,8 +75,8 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
  },
  // Task 5a: guarded evidenced-window write (date + method + one provenance key). Not mirrored: claim_provenance_safe and the no-overlap exclusion (DB suite).
  set_security_window(rowsOf,a){
-  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date,tm=a.p_to_method===undefined?'delisting':a.p_to_method;
-  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)||(side==='to'&&tm!=='delisting'&&tm!=='sec_file_absent'))
+  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date,tm='delisting';
+  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)|| 'p_to_method' in a)
    throw new TableError('rpc','set_security_window','invalid_window_write','22023');
   if(!rowsOf('issuers').some(r=>r.issuer_id===a.p_issuer))return 'not_found';
   const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 39e8f93..d5e41ce 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb,text)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)','public.patch_security_provenance(uuid,text,date,jsonb,text[])','public.close_security_absent(uuid,text,date,date,text,jsonb)'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -1027,8 +1027,8 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
  });
 
  // Task 5a: evidenced window writes land date + method + one provenance key in one locked UPDATE.
- const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin,toMethod?:string)=>
-  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb${toMethod?',$7':''}) v`,[a,t,from,side,date,JSON.stringify(prov),...(toMethod?[toMethod]:[])]).then(r=>r.rows[0].v as string);
+ const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin)=>
+  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb) v`,[a,t,from,side,date,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
  const winState=async(t:string)=>(await q(`select to_char(valid_from,'YYYY-MM-DD') valid_from,to_char(valid_to,'YYYY-MM-DD') valid_to,valid_from_method,valid_to_method,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
  const WF={valid_from:{source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{list_date:'2001-08-27'}}};
  const WT={valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{delist_date:'2026-06-30'}}};
@@ -1064,8 +1064,8 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('written');
   expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('duplicate');
   expect((await winState(t)).provenance).toEqual({exchange:'Nasdaq',...PC});
-  expect(await setWin(a,t,'2024-03-01','to','2024-11-02',{valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}},admin,'sec_file_absent')).toBe('written');
-  expect(await winState(t)).toMatchObject({valid_to:'2024-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}}});
+  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',PC.pending_change.first_missing_sha256,{valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}})).toBe('written');
+  expect(await winState(t)).toMatchObject({valid_to:'2026-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}}});
   expect(await patchProv(a,t,'2024-03-01',{},['pending_change'])).toBe('not_found');   // closed
   const u=await ticker();
   await sec(a,u,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
@@ -1076,8 +1076,10 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   expect(await patchProv(a,await ticker(),'2024-03-01',PC,[])).toBe('not_found');
   expect(await patchProv(randomUUID(),u,'2024-03-01',PC,[])).toBe('not_found');
   for(const bad of [()=>patchProv(a,u,'2024-03-01',{isin:'x'},[]),()=>patchProv(a,u,'2024-03-01',{},['exchange']),()=>patchProv(a,u,'2024-03-01',{pending_change:{url:'https://a.example/p?token=1'}},[]),
-   ()=>setWin(a,u,'2024-03-01','to','2025-01-01',{valid_to:{source:'x'}},admin,'curated')])
+  ])
    expect(await fails(bad())).toMatchObject({message:expect.stringMatching(/invalid_(provenance_patch|window_write)/),code:'22023'});
+  // set_security_window cannot close as sec_file_absent: there is no method argument any more
+  await expect(admin.query(`select public.set_security_window($1,$2,'2024-03-01'::date,'to','2025-01-01'::date,'{"valid_to":{"source":"x"}}'::jsonb,'sec_file_absent')`,[a,u])).rejects.toThrow(/does not exist/);
  });
  const closeAbs=(a:string,t:string,from:string,to:string,sha:string,prov:unknown,on:Pool|PoolClient=admin)=>
   on.query(`select public.close_security_absent($1,$2,$3::date,$4::date,$5,$6::jsonb) v`,[a,t,from,to,sha,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
@@ -1117,7 +1119,7 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   });
   expect((await winState(t)).valid_to).toBeNull();
  });
- it('set_security_window leaves ONE function after the signature change; the 6-argument call (default method) closes with delisting; unknown methods are refused',async()=>{
+ it('set_security_window leaves ONE function after the signature change; a window close is always delisting',async()=>{
   expect(await q(`select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='set_security_window'`)).toEqual([{n:1}]);
   const a=await issuer();const t=await ticker();
   await sec(a,t,'2024-03-01',null);
diff --git a/src/lib/entities/load-sec-ticker-change.test.ts b/src/lib/entities/load-sec-ticker-change.test.ts
index 78ebb57..2cba21c 100644
--- a/src/lib/entities/load-sec-ticker-change.test.ts
+++ b/src/lib/entities/load-sec-ticker-change.test.ts
@@ -5,7 +5,7 @@
 import {describe,it,expect} from 'vitest';
 import {memoryTableClient} from '../db/memory-table-client';
 import type {SecExchangeRow} from '../research/entity-keys/parsers';
-import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,lastSeenFromSnapshots,planSecLoad,sameSecTicker,snapshotMetaOf,unknownIdentities,type TickerChangeDeps} from './load-sec';
+import {applySecLoad,checkSnapshot,detectTickerChanges,fileTickerIndex,lastSeenFromSnapshots,lastSeenInReceipts,planSecLoad,priorSnapshots,recordRefusal,sameSecTicker,snapshotMetaOf,unknownIdentities,type TickerChangeDeps} from './load-sec';
 import {parseSecCompanyTickersExchange} from '../research/entity-keys/parsers';
 import type {Row,TableClient} from '../db/table-client';
 import {resolveIssuer} from './resolve';
@@ -18,7 +18,7 @@ const CIK='1000001',OTHER='1000002';
 const UNIVERSE=new Set(['OLD','NEW','BRK.B','BRK.A']);
 const snap=(sha:string)=>`sec-tickers-exchange/${sha}.json`;
 const r=(cik:string,ticker:string):SecExchangeRow=>({cik,name:cik===CIK?'ZZ Change Co':'ZZ Other Co',ticker,exchange:'Nasdaq'});
-const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id']};
+const KEYS={issuers:['issuer_id'],issuer_identifier_claims:['id'],dq_quarantine:['id'],ingest_batches:['batch_id'],dq_freshness:['dataset']};
 const confirmed=(tickers:string[]):TickerChangeDeps['confirm']=>async()=>({tickers,sha256:H('e')});
 async function run(c:TableClient&{rows(t:string):Row[]},rows:SecExchangeRow[],asOf:string,fileSha:string,confirm=confirmed(['NEW']),rejected:{cik?:string;ticker?:string}[]=[],lastSeen:TickerChangeDeps['lastSeenAsOf']=async()=>T0){
  await applySecLoad(c,planSecLoad(rows,UNIVERSE,asOf),{asOf,batchId:BATCH,batchProducerMeta:{sourceRows:rows.length,rejected:[]}});
@@ -214,3 +214,77 @@ describe('review fixes',()=>{
   expect(prov(rowOf(c,'OLD')).valid_to!.last_seen_as_of).toBeNull();
  });
 });
+
+describe('review round 2',()=>{
+ it('a refused apply leaves a rejected batch with the code and a failed freshness attempt',async()=>{
+  const c=memoryTableClient(KEYS);
+  const id=await recordRefusal(c,{dataset:'entities.sec',cadence:'daily',toolVersions:{file:'x.json',as_of:T1,fetched_at:F(T1)},code:'stale_snapshot'});
+  expect(c.rows('ingest_batches')).toHaveLength(1);
+  expect(c.rows('ingest_batches')[0]).toMatchObject({batch_id:id,status:'rejected',dataset:'entities.sec'});
+  expect((c.rows('ingest_batches')[0].errors as {code:string}[]).map(e=>e.code)).toEqual(['stale_snapshot']);
+  expect(c.rows('dq_freshness')[0]).toMatchObject({dataset:'entities.sec',consecutive_errors:1});
+  expect(await priorSnapshots(c,'entities.sec')).toEqual([]);      // a refusal is never a prior snapshot
+ });
+ it('last-seen search covers more than 50 receipts (paginated), stopping at the latest match',async()=>{
+  const c=memoryTableClient(KEYS);
+  for(let i=0;i<120;i++){
+   const d=new Date(Date.UTC(2026,0,1)+i*86_400_000).toISOString().slice(0,10);
+   await c.insert('ingest_batches',{batch_id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,dataset:'entities.sec',status:'success',started_at:`${d}T06:00:00.000Z`,tool_versions:{as_of:d,fetched_at:`${d}T06:00:00.000Z`,rows:'1',sha256:H('1'),raw_path:`sec-tickers-exchange/${d}.json`}});
+  }
+  const receipts=await priorSnapshots(c,'entities.sec');
+  expect(receipts).toHaveLength(120);expect(receipts[0].as_of>receipts[119].as_of).toBe(true);
+  const loaded:string[]=[];
+  const load=async(p:string)=>{loaded.push(p);return p.includes('2026-01-03')?[r(CIK,'OLD')]:[r(CIK,'NEW')];};
+  expect(await lastSeenInReceipts(receipts,load,CIK,'OLD','2026-06-01')).toBe('2026-01-03');
+  expect(loaded.length).toBe(118);      // everything newer than the only hit within the window was examined
+  expect(await lastSeenInReceipts(receipts,async()=>[r(OTHER,'OLD')],CIK,'OLD','2026-06-01')).toBeNull();
+ });
+ it('the unavailable reason of the second source is kept in sec_unavailable',async()=>{
+  const c=memoryTableClient(KEYS);
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  const t2=await run(c,[r(CIK,'NEW')],T2,H('2'),async()=>({unavailable:'sec_unavailable: http_503'}));
+  expect(t2.errors.find(e=>e.code==='sec_unavailable')?.message).toContain('http_503');
+  expect(rowOf(c,'OLD').valid_to).toBeNull();
+ });
+ const cycle=async(c:TableClient&{rows(t:string):Row[]},afterFirstClose?:()=>void)=>{
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  await run(c,[r(CIK,'NEW')],T2,H('2'));                              // first close (valid_to T1)
+  afterFirstClose?.();
+  await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],T3,H('5'));                 // reappears: new row from T3
+  await run(c,[r(CIK,'NEW')],'2026-11-21',H('6'));                    // first miss again
+  return run(c,[r(CIK,'NEW')],'2026-11-30',H('7'));                   // second close (valid_to 2026-11-21)
+ };
+ it('close, reappear, close again: the second close evidence is appended to the pending claim',async()=>{
+  const c=memoryTableClient(KEYS);
+  const last=await cycle(c);
+    expect(c.rows('issuer_identifier_claims')).toHaveLength(1);
+  const d=c.rows('issuer_identifier_claims')[0].detail as {evidence:{evidence_sha256:string};sources:{evidence_sha256:string}[]};
+  expect([d.evidence,...d.sources].map(e=>e.evidence_sha256).sort()).toEqual([H('2'),H('7')].sort());
+ });
+ it('close, claim resolved, reappear, close again whose claim write fails: the repair files THIS close (an older resolved claim is not enough)',async()=>{
+  const mem=memoryTableClient(KEYS);
+  let fail=false;
+  const c=new Proxy(mem,{get(t,k,rcv){
+   if(k==='insert')return async(table:string,row:Row)=>{if(fail&&table==='issuer_identifier_claims')throw new Error('boom');return t.insert(table,row);};
+   const v=Reflect.get(t,k,rcv);return typeof v==='function'?v.bind(t):v;
+  }}) as unknown as typeof mem;
+  await run(c,[r(CIK,'OLD')],T0,H('0'));
+  await run(c,[r(CIK,'NEW')],T1,H('1'));
+  await run(c,[r(CIK,'NEW')],T2,H('2'));
+  await mem.update('issuer_identifier_claims',{id:mem.rows('issuer_identifier_claims')[0].id},{status:'accepted',resolved_at:new Date().toISOString()});
+  await run(c,[r(CIK,'OLD'),r(CIK,'NEW')],T3,H('5'));
+  await run(c,[r(CIK,'NEW')],'2026-11-21',H('6'));
+  fail=true;
+  await run(c,[r(CIK,'NEW')],'2026-11-30',H('7'));
+  expect(mem.rows('issuer_identifier_claims')).toHaveLength(1);
+  fail=false;
+  const next=await run(c,[r(CIK,'NEW')],'2026-12-01',H('8'));
+  expect(next.claims).toBe(1);
+  const claims=mem.rows('issuer_identifier_claims');
+  expect(claims.map(k=>k.status)).toEqual(['accepted','pending']);
+  expect((claims[1].detail as {params:{first_missing_as_of:string}}).params.first_missing_as_of).toBe('2026-11-21');
+  expect((await run(c,[r(CIK,'NEW')],'2026-12-02',H('9'))).claims).toBe(0);
+ });
+});
diff --git a/src/lib/entities/load-sec.ts b/src/lib/entities/load-sec.ts
index a64a097..be521f2 100644
--- a/src/lib/entities/load-sec.ts
+++ b/src/lib/entities/load-sec.ts
@@ -5,6 +5,8 @@
 // domicile and the file carries no share class, so country_code is never set and share_class is
 // always 'unknown'.
 import {callRpc,selectAll,type Row,type TableClient} from '../db/table-client';
+import {finishBatch,startBatch} from '../dq/batches';
+import {recordAttempt,type Cadence} from '../dq/freshness';
 import {fileClaim} from './claims';
 import {sanitizeProvenance} from './provenance';
 import type {ClaimEvidence} from './types';
@@ -244,9 +246,11 @@ export interface TickerChangeInput{
  /** rejected rows of this file: their CIKs/tickers are unknown, never absent */
  rejected?:readonly {cik?:string;ticker?:string}[];
 }
+/** null / {unavailable} = the second source could not be read: the close is deferred (the message is kept in the error). */
+export type ConfirmResult={tickers:string[];sha256:string;path?:string}|{unavailable:string}|null;
 export interface TickerChangeDeps{
  /** submissions tickers[] for a CIK fetched in this run (the second source); null = SEC unavailable */
- confirm:(cik:string)=>Promise<{tickers:string[];sha256:string;path?:string}|null>;
+ confirm:(cik:string)=>Promise<ConfirmResult>;
  /** as_of of the latest RETAINED snapshot before `before` that listed `ticker` under `cik`, or null */
  lastSeenAsOf:(cik:string,ticker:string,before:string)=>Promise<string|null>;
 }
@@ -264,6 +268,14 @@ const patchProvenance=(client:TableClient,issuer:string,ticker:string,validFrom:
  callRpc(client,'patch_security_provenance',{p_issuer:issuer,p_ticker:ticker,p_valid_from:validFrom,p_set:set,p_remove:remove});
 
 interface CloseEvidence{issuerId:string;cik:string;ticker:string;replacement:string[];firstMissingAsOf:string;asOf:string;closingSha256:string;closingRawPath:string|null;submissionsSha256:string|null}
+/** True when the claim already holds this close: params.first_missing_as_of equals the close's, or an evidence item carries its closing_sha256. */
+function claimCarriesClose(claim:Row,vt:Record<string,unknown>):boolean{
+ const d=(claim.detail&&typeof claim.detail==='object'?claim.detail:{}) as {params?:Record<string,unknown>;evidence?:{evidence_sha256?:unknown};sources?:{evidence_sha256?:unknown}[]};
+ const sha=vt.closing_sha256;
+ if(typeof vt.first_missing_as_of==='string'&&d.params?.first_missing_as_of===vt.first_missing_as_of)return true;
+ return typeof sha==='string'&&(d.evidence?.evidence_sha256===sha||(Array.isArray(d.sources)&&d.sources.some(e=>e?.evidence_sha256===sha)));
+}
+
 /** The evidence_only ticker-change claim of a sec_file_absent close (idempotent: fileClaim appends evidence to a pending twin). */
 async function fileCloseClaim(client:TableClient,e:CloseEvidence):Promise<boolean>{
  const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:e.asOf,evidence_sha256:e.closingSha256,...(e.closingRawPath?{locator:e.closingRawPath}:{})};
@@ -299,7 +311,7 @@ export async function detectTickerChanges(client:TableClient,input:TickerChangeI
   if(!cikCache.has(issuerId)){const [i]=await client.select('issuers',{issuer_id:issuerId},{limit:1});cikCache.set(issuerId,i&&i.status==='active'&&typeof i.cik==='string'?i.cik:null);}
   return cikCache.get(issuerId)!;
  };
- const confirmCache=new Map<string,{tickers:string[];sha256:string;path?:string}|null>();
+ const confirmCache=new Map<string,ConfirmResult>();
  const confirmOf=async(cik:string)=>{if(!confirmCache.has(cik))confirmCache.set(cik,await deps.confirm(cik));return confirmCache.get(cik)!;};
  for(const row of open){
   const ticker=String(row.ticker),issuerId=String(row.issuer_id),validFrom=String(row.valid_from);
@@ -334,7 +346,7 @@ export async function detectTickerChanges(client:TableClient,input:TickerChangeI
    }
    if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
    const conf=await confirmOf(cik);
-   if(!conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:'submissions not available: close deferred'});continue;}
+   if(!conf||'unavailable' in conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:`submissions not available: close deferred${conf?` (${conf.unavailable})`:''}`.slice(0,500)});continue;}
    if(conf.tickers.some(t=>sameSecTicker(t,ticker))){skipped.push('close_unconfirmed');continue;}
    if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
    const lastSeen=await deps.lastSeenAsOf(cik,ticker,pc.first_missing_as_of);
@@ -350,10 +362,12 @@ export async function detectTickerChanges(client:TableClient,input:TickerChangeI
  for(const row of await selectAll(client,'issuer_securities',{valid_to_method:'sec_file_absent',source:SEC_SOURCE},'ticker')){
   const ticker=String(row.ticker),issuerId=String(row.issuer_id);
   try{
-   if((await client.select('issuer_identifier_claims',{issuer_id:issuerId,id_type:'ticker',value:ticker,op:'evidence_only'},{limit:1})).length)continue;
-   const cik=await cikOf(issuerId);
    const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
    const vt=(prov.valid_to&&typeof prov.valid_to==='object'?prov.valid_to:{}) as Record<string,unknown>;
+   // THIS close's evidence must be persisted (any status): an older / unrelated / resolved claim is not enough.
+   const existing=await selectAll(client,'issuer_identifier_claims',{issuer_id:issuerId,id_type:'ticker',value:ticker,op:'evidence_only'},'id');
+   if(existing.some(k=>claimCarriesClose(k,vt)))continue;
+   const cik=await cikOf(issuerId);
    const pc=pendingOf(prov.pending_change);
    if(!cik||typeof vt.as_of!=='string'||typeof vt.closing_sha256!=='string'||typeof vt.first_missing_as_of!=='string'){errors.push({code:'claim_repair_skipped',key:`${ticker}:${String(row.valid_from)}`});continue;}
    if(await fileCloseClaim(client,{issuerId,cik,ticker,replacement:pc?.replacement_tickers??[],firstMissingAsOf:vt.first_missing_as_of,asOf:vt.as_of,closingSha256:vt.closing_sha256,
@@ -365,3 +379,34 @@ export async function detectTickerChanges(client:TableClient,input:TickerChangeI
  const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
  return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},pending,cleared,closed,claims};
 }
+
+/** Every successful (success/partial) entities.sec receipt, newest first; paginates all of them (never a capped page). */
+export async function priorSnapshots(client:TableClient,dataset:string):Promise<SnapshotMeta[]>{
+ const rows:Row[]=[];
+ for(const status of ['success','partial'])rows.push(...await selectAll(client,'ingest_batches',{dataset,status},'batch_id'));
+ return rows.sort((a,b)=>String(b.started_at).localeCompare(String(a.started_at))).map(snapshotMetaOf).filter((m):m is SnapshotMeta=>m!==null);
+}
+
+/**
+ * as_of of the latest retained receipt (as_of < before, newest first, over ALL receipts) whose archived file
+ * listed the ticker under the CIK; stops at the first hit, null when history is exhausted.
+ */
+export async function lastSeenInReceipts(receipts:readonly SnapshotMeta[],load:(path:string)=>Promise<readonly SecExchangeRow[]|null>,cik:string,ticker:string,before:string):Promise<string|null>{
+ for(const m of [...receipts].sort((a,b)=>b.as_of.localeCompare(a.as_of))){
+  if(!m.raw_path||m.as_of>=before)continue;
+  const rows=await load(m.raw_path);
+  if(rows?.some(r=>r.cik===cik&&sameSecTicker(r.ticker,ticker)))return m.as_of;
+ }
+ return null;
+}
+
+/**
+ * A refused --apply run still leaves evidence: a rejected batch carrying the code, and a failed freshness attempt.
+ * Returns the batch id.
+ */
+export async function recordRefusal(client:TableClient,input:{dataset:string;cadence:Cadence;toolVersions:Record<string,string>;code:string;message?:string}):Promise<string>{
+ const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:input.dataset,toolVersions:input.toolVersions});
+ await finishBatch(client,batchId,{counts:emptyCounts(),errors:[{code:input.code,...(input.message?{message:input.message.slice(0,500)}:{})}],rejected:true});
+ await recordAttempt(client,input.dataset,{ok:false,cadence:input.cadence,detail:{refused:input.code}});
+ return batchId;
+}
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index ff0e94a..68e04b1 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "889766926f82167bfaa830874114a260c4db6d62e9b3f968d32e1d6000640488"
+      "sha256": "6457ecff0c498b03d10665e9f56c811b026d9ef3cabee58b8017c32ff3799ee0"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index 6ba7b03..a585565 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -806,22 +806,22 @@ grant execute on function public.set_security_identifier(uuid, text, date, text,
 -- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
 --   p_new_date <= valid_from and no other row of the ticker starting earlier; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
 -- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
---   sets valid_to, valid_to_method = p_to_method ('delisting' default, or 'sec_file_absent'; others invalid_window_write). Other provenance keys (pending_change) are kept.
+--   sets valid_to, valid_to_method = 'delisting' (a sec_file_absent close only goes through close_security_absent). Other provenance keys (pending_change) are kept.
 -- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
 -- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
 -- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
 -- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
--- one function only: replays and the signature change (p_to_method) must not leave the 6-argument overload behind
+-- one function only: both historical signatures are dropped so replays leave exactly the 6-argument form
+drop function if exists public.set_security_window(uuid, text, date, text, date, jsonb, text);
 drop function if exists public.set_security_window(uuid, text, date, text, date, jsonb);
-create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb, p_to_method text default 'delisting')
+create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
 returns text language plpgsql security definer set search_path = public as $$
 declare v_row public.issuer_securities%rowtype; n int;
 begin
   if p_side is null or p_side not in ('from', 'to') or p_new_date is null or p_ticker is null or p_valid_from is null
      or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
      or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_' || p_side]
-     or not public.claim_provenance_safe(p_provenance)
-     or (p_side = 'to' and (p_to_method is null or p_to_method <> all (array['delisting', 'sec_file_absent']))) then
+     or not public.claim_provenance_safe(p_provenance) then
     raise exception 'invalid_window_write' using errcode = '22023';
   end if;
   perform 1 from public.issuers where issuer_id = p_issuer for share;
@@ -840,17 +840,17 @@ begin
     update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
     where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
   else
-    if v_row.valid_to = p_new_date and v_row.valid_to_method = p_to_method and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
+    if v_row.valid_to = p_new_date and v_row.valid_to_method = 'delisting' and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
     if v_row.valid_to is not null or p_new_date <= v_row.valid_from then return 'conflict'; end if;
-    update public.issuer_securities set valid_to = p_new_date, valid_to_method = p_to_method, provenance = provenance || p_provenance
+    update public.issuer_securities set valid_to = p_new_date, valid_to_method = 'delisting', provenance = provenance || p_provenance
     where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
   end if;
   get diagnostics n = row_count;
   if n <> 1 then return 'conflict'; end if;
   return 'written';
 end $$;
-revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) from public, anon, authenticated;
-grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb, text) to service_role;
+revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
+grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;
 
 -- close_security_absent: the only writer of a sec_file_absent close (load-sec detectTickerChanges). The close is
 -- conditional on the pending marker the run observed: the row must be open AND carry pending_change with the same

exec
/bin/zsh -lc 'cat ../../../AGENTS.md; find . -name CLAUDE.md -o -name AGENTS.override.md -o -name AGENTS.md; cat src/lib/entities/claims.ts; cat src/lib/db/table-client.ts; cat src/lib/dq/freshness.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 17ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/entities/claims.ts
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
// Minimal table access used by dq/* and entities/* so logic is unit-testable with an
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
// Freshness registry (spec §5.1 dq_freshness). Status is a pure function of cadence window
// and grace; writers store it, readers recompute it with `now` (freshnessOf) because a
// producer that stops running never calls recordAttempt again. Fails closed, never fresh: an
// unknown stored cadence reads as error, an unparseable lastOkAt as missing, and an invalid `now`
// throws invalid_now (validated before the event-cadence shortcut).
import {selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';

export type Cadence='daily'|'weekly'|'monthly'|'quarterly'|'event';
export type FreshnessStatus='fresh'|'stale'|'error'|'missing';
const DAY=86_400_000;
const WINDOW_MS:Record<Cadence,number|null>={daily:1*DAY,weekly:7*DAY,monthly:31*DAY,quarterly:92*DAY,event:null};
// Daily grace of 2d lets a weekday-only feed survive a weekend (Fri ok -> Mon is 3d <= 1d+2d); weekly
// (reconcile cycles, spec 3 §3.1) gets the same 2d so one late cron run does not flip it to stale.
const GRACE_MS:Record<Cadence,number>={daily:2*DAY,weekly:2*DAY,monthly:3*DAY,quarterly:3*DAY,event:0};
export const CADENCES:readonly Cadence[]=['daily','weekly','monthly','quarterly','event'];

const validDate=(d:unknown):d is Date=>d instanceof Date&&Number.isFinite(d.getTime());

export function computeFreshness(input:{cadence:Cadence;lastOkAt:Date|null;consecutiveErrors:number;now:Date}):FreshnessStatus{
 if(!validDate(input.now))throw new Error('invalid_now');
 const lastOkAt=validDate(input.lastOkAt)?input.lastOkAt:null;
 if(input.consecutiveErrors>=2)return 'error';
 if(!lastOkAt)return 'missing';
 const window=WINDOW_MS[input.cadence];
 if(window===null)return 'fresh';
 const age=input.now.getTime()-lastOkAt.getTime();
 return age<=window+GRACE_MS[input.cadence]?'fresh':'stale';
}

/**
 * Records one producer attempt as a read-then-upsert. Assumes a single producer per dataset:
 * concurrent attempts for the same dataset can lose a consecutive_errors increment.
 */
export async function recordAttempt(client:TableClient,dataset:string,input:{ok:boolean;cadence:Cadence;now?:Date;detail?:Record<string,unknown>}):Promise<FreshnessStatus>{
 if(typeof dataset!=='string'||dataset.length<1||dataset.length>64)throw new Error('invalid_dataset');
 if(!CADENCES.includes(input.cadence))throw new Error('invalid_cadence');
 const now=input.now??new Date();
 if(!validDate(now))throw new Error('invalid_now');
 const existing=(await client.select('dq_freshness',{dataset}))[0];
 const storedOk=existing?.last_ok_at?new Date(existing.last_ok_at as string):null;
 const prevOk=validDate(storedOk)?storedOk:null; // unparseable stored value is dropped, not re-written
 const prevErrors=Number(existing?.consecutive_errors??0);
 const consecutiveErrors=input.ok?0:prevErrors+1;
 const lastOkAt=input.ok?now:prevOk;
 const status=computeFreshness({cadence:input.cadence,lastOkAt,consecutiveErrors,now});
 await client.upsert('dq_freshness',{
  dataset,expected_cadence:input.cadence,last_ok_at:lastOkAt?lastOkAt.toISOString():null,last_attempt_at:now.toISOString(),
  consecutive_errors:consecutiveErrors,status,detail:input.detail??{},updated_at:now.toISOString(),
 },'dataset');
 return status;
}

/** All freshness rows with status recomputed at `now`; `stored_status` keeps what the writer last stored. */
export async function freshnessOf(client:TableClient,now=new Date()):Promise<(Row&{stored_status:string;status:FreshnessStatus})[]>{
 const rows=await selectAll(client,'dq_freshness',{},'dataset');
 return rows.map(r=>({...r,stored_status:String(r.status),status:CADENCES.includes(r.expected_cadence as Cadence)?computeFreshness({
  cadence:r.expected_cadence as Cadence,lastOkAt:r.last_ok_at?new Date(r.last_ok_at as string):null,
  consecutiveErrors:Number(r.consecutive_errors??0),now}):'error'}));
}

exec
/bin/zsh -lc "sed -n '1,65p' src/lib/entities/load-sec.ts; sed -n '190,245p' src/lib/entities/load-sec.ts; sed -n '275,380p' src/lib/entities/load-sec.ts; cat scripts/entity-keys/load-sec-issuers.ts; cat src/lib/dq/batches.ts; cat package.json | head -70" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Load US issuers and their listed securities from SEC company_tickers_exchange.json.
// planSecLoad is pure. applySecLoad performs the public writes through a TableClient and returns
// receipt counts; the script owns the ingest batch, and every conflict is parked as a dq_quarantine
// row of that batch. SEC exchange membership does not establish
// domicile and the file carries no share class, so country_code is never set and share_class is
// always 'unknown'.
import {callRpc,selectAll,type Row,type TableClient} from '../db/table-client';
import {finishBatch,startBatch} from '../dq/batches';
import {recordAttempt,type Cadence} from '../dq/freshness';
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

 * THE SEC ticker equivalence rule (presence, ownership and the submissions confirmation all use it): a
 * ticker's aliases are its exact upper-cased form and its normalized form (separators / - → '.', share
 * class kept: BRK.B ≡ BRK-B; a Wind suffix is stripped, which can make an alias ambiguous: BRK.A → BRK).
 */
export function secTickerAliases(raw:string):string[]{
 const exact=raw.trim().toUpperCase();
 if(!exact)return [];
 const n=normalizeSecurityTicker(raw,'US');
 return n&&n!==exact?[exact,n]:[exact];
}
export const sameSecTicker=(a:string,b:string)=>{const s=new Set(secTickerAliases(a));return secTickerAliases(b).some(x=>s.has(x));};

/** Aliases per CIK, and EVERY CIK listing an alias (ambiguous aliases keep all owners). */
export function fileTickerIndex(rows:readonly SecExchangeRow[]):{byCik:Map<string,Set<string>>;owners:Map<string,Set<string>>}{
 const byCik=new Map<string,Set<string>>(),owners=new Map<string,Set<string>>();
 for(const r of rows){
  const set=byCik.get(r.cik)??new Set<string>();
  for(const a of secTickerAliases(r.ticker)){
   set.add(a);
   const o=owners.get(a)??new Set<string>();o.add(r.cik);owners.set(a,o);
  }
  byCik.set(r.cik,set);
 }
 return {byCik,owners};
}

/**
 * Identities that appear in REJECTED rows of the snapshot are UNKNOWN, not absent. A rejected row
 * with neither a CIK nor a ticker could be anyone: then nothing is unknown-specific but `all` is set.
 */
export function unknownIdentities(rejected:readonly {cik?:string;ticker?:string}[]):{ciks:Set<string>;tickers:Set<string>;all:boolean}{
 const ciks=new Set<string>(),tickers=new Set<string>();let all=false;
 for(const r of rejected){
  if(r.cik===undefined&&r.ticker===undefined)all=true;
  if(r.cik!==undefined)ciks.add(r.cik);
  if(r.ticker!==undefined)for(const a of secTickerAliases(r.ticker))tickers.add(a);
 }
 return {ciks,tickers,all};
}

/** Latest retained snapshot (as_of < before) that actually listed the ticker (equivalence rule) under the CIK; otherwise null. */
export function lastSeenFromSnapshots(snapshots:readonly {as_of:string;rows:readonly SecExchangeRow[]|null}[],cik:string,ticker:string,before:string):string|null{
 let best:string|null=null;
 for(const s of snapshots){
  if(!s.rows||s.as_of>=before||(best!==null&&s.as_of<=best))continue;
  if(s.rows.some(r=>r.cik===cik&&sameSecTicker(r.ticker,ticker)))best=s.as_of;
 }
 return best;
}

export const CLOSE_MIN_DAYS=7;
const DAY_MS=86_400_000;
export interface TickerChangeInput{
 rows:readonly SecExchangeRow[];asOf:string;fetchedAt:string;fileSha256:string;batchId:string;
 /** raw-store path of this run's archived exchange file (archived BEFORE any dependent write) */
 snapshotPath:string;
 if(typeof vt.first_missing_as_of==='string'&&d.params?.first_missing_as_of===vt.first_missing_as_of)return true;
 return typeof sha==='string'&&(d.evidence?.evidence_sha256===sha||(Array.isArray(d.sources)&&d.sources.some(e=>e?.evidence_sha256===sha)));
}

/** The evidence_only ticker-change claim of a sec_file_absent close (idempotent: fileClaim appends evidence to a pending twin). */
async function fileCloseClaim(client:TableClient,e:CloseEvidence):Promise<boolean>{
 const evidence:ClaimEvidence={source:SEC_SOURCE,as_of:e.asOf,evidence_sha256:e.closingSha256,...(e.closingRawPath?{locator:e.closingRawPath}:{})};
 const note=`观测到 ${e.ticker} 消失、${e.replacement.join('/')||'（无新代码）'} 出现；换码生效日需 8-K/公告证据`;
 return fileClaim(client,{issuer_id:e.issuerId,id_type:'ticker',value:e.ticker,source:SEC_SOURCE,op:'evidence_only',detail:{
  schema:'claim/1',evidence_kind:'official_list',target:{issuer_id:e.issuerId},
  params:{suggested_op:'backdate_window',old_ticker:e.ticker,cik:e.cik,replacement_tickers:e.replacement,first_missing_as_of:e.firstMissingAsOf,...(e.submissionsSha256?{submissions_sha256:e.submissionsSha256}:{}),note},
  evidence,sources:[evidence],
 }});
}

/**
 * Runs after applySecLoad on the same file (which must already be archived: snapshotPath). For every open row
 * with source SEC_SOURCE whose ticker the file no longer lists for the issuer's CIK (equivalence rule
 * secTickerAliases): first miss → provenance.pending_change; reappearance → pending_change removed; close only
 * when still missing, ≥ CLOSE_MIN_DAYS since the first miss (fetched_at), a different file hash, and the CIK's
 * submissions tickers[] no longer list it. Identities in rejected rows are UNKNOWN: no first miss, no close.
 * The close is an OBSERVATION bound (valid_to = first_missing_as_of, method sec_file_absent), never a
 * ticker-change effective date: that only comes from a reviewed claim (evidence_only filed here).
 * Concurrency guard: the close is the SQL function close_security_absent, conditional on the pending marker
 * (first_missing_sha256 / first_missing_as_of) this run observed, so a reappearance or a concurrent run that
 * cleared or replaced the marker turns the close into a conflict instead of a stale write.
 * Durability: every run also files the claim of any sec_file_absent close that lacks one.
 */
export async function detectTickerChanges(client:TableClient,input:TickerChangeInput,deps:TickerChangeDeps):Promise<TickerChangeResult>{
 const counts=emptyCounts();const errors:BatchError[]=[];const skipped:string[]=[];
 let pending=0,cleared=0,closed=0,claims=0;
 const {byCik,owners}=fileTickerIndex(input.rows);
 const unknown=unknownIdentities(input.rejected??[]);
 const open=await selectAll(client,'issuer_securities',{valid_to:null,source:SEC_SOURCE},'ticker');
 const cikCache=new Map<string,string|null>();
 const cikOf=async(issuerId:string)=>{
  if(!cikCache.has(issuerId)){const [i]=await client.select('issuers',{issuer_id:issuerId},{limit:1});cikCache.set(issuerId,i&&i.status==='active'&&typeof i.cik==='string'?i.cik:null);}
  return cikCache.get(issuerId)!;
 };
 const confirmCache=new Map<string,ConfirmResult>();
 const confirmOf=async(cik:string)=>{if(!confirmCache.has(cik))confirmCache.set(cik,await deps.confirm(cik));return confirmCache.get(cik)!;};
 for(const row of open){
  const ticker=String(row.ticker),issuerId=String(row.issuer_id),validFrom=String(row.valid_from);
  const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
  const pc=pendingOf(prov.pending_change);
  const aliases=secTickerAliases(ticker);
  const changed=()=>{counts.failed++;errors.push({code:'row_changed',key:`${ticker}:${validFrom}`});};
  try{
   const cik=await cikOf(issuerId);
   if(!cik){skipped.push('no_cik');continue;}
   if(aliases.some(a=>byCik.get(cik)?.has(a))){
    if(prov.pending_change!==undefined){
     const out=await patchProvenance(client,issuerId,ticker,validFrom,{},['pending_change']);
     if(out==='written'){counts.versioned++;cleared++;}else if(out==='not_found')changed();
    }
    continue;
   }
   if(unknown.all||unknown.ciks.has(cik)||aliases.some(a=>unknown.tickers.has(a))){skipped.push('unknown_rejected_row');continue;}
   const otherOwners=[...new Set(aliases.flatMap(a=>[...(owners.get(a)??[])]))].filter(c=>c!==cik).sort();
   if(otherOwners.length){
    await parkConflict(client,{dataset:SEC_DATASET,table:'issuer_securities',naturalKey:`${ticker}:${validFrom}`,reasonCode:'ownership_conflict',
     detail:{reason:'ticker_listed_under_other_cik',cik:otherOwners[0],owner_ciks:otherOwners,holder_cik:cik},payload:{issuer_id:issuerId,ticker,valid_from:validFrom,cik:otherOwners[0]},batchId:input.batchId},
     counts,errors,{code:'ownership_conflict',key:ticker});
    continue;
   }
   if(!pc){
    const replacement=open.filter(o=>String(o.issuer_id)===issuerId&&String(o.valid_from)===input.asOf&&String(o.ticker)!==ticker).map(o=>String(o.ticker)).sort();
    const set=sanitizeProvenance({pending_change:{first_missing_as_of:input.asOf,first_missing_sha256:input.fileSha256,first_missing_fetched_at:input.fetchedAt,replacement_tickers:replacement,sources:[SEC_SOURCE],first_missing_raw_path:input.snapshotPath}});
    const out=await patchProvenance(client,issuerId,ticker,validFrom,set,[]);
    if(out==='written'){counts.versioned++;pending++;}else if(out==='not_found')changed();
    continue;
   }
   if(Date.parse(input.fetchedAt)-Date.parse(pc.first_missing_fetched_at)<CLOSE_MIN_DAYS*DAY_MS||input.fileSha256===pc.first_missing_sha256){skipped.push('close_pending');continue;}
   const conf=await confirmOf(cik);
   if(!conf||'unavailable' in conf){skipped.push('close_unconfirmed');errors.push({code:'sec_unavailable',key:cik,message:`submissions not available: close deferred${conf?` (${conf.unavailable})`:''}`.slice(0,500)});continue;}
   if(conf.tickers.some(t=>sameSecTicker(t,ticker))){skipped.push('close_unconfirmed');continue;}
   if(pc.first_missing_as_of<=validFrom){counts.failed++;errors.push({code:'invalid_window',key:`${ticker}:${validFrom}`,message:`first_missing_as_of ${pc.first_missing_as_of} <= valid_from`});continue;}
   const lastSeen=await deps.lastSeenAsOf(cik,ticker,pc.first_missing_as_of);
   const provenance=sanitizeProvenance({valid_to:{source:SEC_SOURCE,as_of:input.asOf,first_missing_as_of:pc.first_missing_as_of,first_missing_sha256:pc.first_missing_sha256,
    closing_sha256:input.fileSha256,closing_raw_path:input.snapshotPath,submissions_sha256:conf.sha256,...(conf.path?{submissions_raw_path:conf.path}:{}),...(pc.first_missing_raw_path?{first_missing_raw_path:pc.first_missing_raw_path}:{}),last_seen_as_of:lastSeen}});
   const closeOut=await callRpc(client,'close_security_absent',{p_issuer:issuerId,p_ticker:ticker,p_valid_from:validFrom,p_valid_to:pc.first_missing_as_of,p_expected_first_missing_sha256:pc.first_missing_sha256,p_provenance:provenance});
   if(closeOut!=='written'&&closeOut!=='duplicate'){changed();continue;}
   if(closeOut==='written'){counts.versioned++;closed++;}
   if(await fileCloseClaim(client,{issuerId,cik,ticker,replacement:pc.replacement_tickers,firstMissingAsOf:pc.first_missing_as_of,asOf:input.asOf,closingSha256:input.fileSha256,closingRawPath:input.snapshotPath,submissionsSha256:conf.sha256}))claims++;
  }catch(e){counts.failed++;errors.push({code:'ticker_change_error',key:ticker,message:errorMessage(e)});}
 }
 // Durable claims: a close whose claim write failed (or never ran) is repaired on any later run.
 for(const row of await selectAll(client,'issuer_securities',{valid_to_method:'sec_file_absent',source:SEC_SOURCE},'ticker')){
  const ticker=String(row.ticker),issuerId=String(row.issuer_id);
  try{
   const prov=(row.provenance&&typeof row.provenance==='object'?row.provenance:{}) as Record<string,unknown>;
   const vt=(prov.valid_to&&typeof prov.valid_to==='object'?prov.valid_to:{}) as Record<string,unknown>;
   // THIS close's evidence must be persisted (any status): an older / unrelated / resolved claim is not enough.
   const existing=await selectAll(client,'issuer_identifier_claims',{issuer_id:issuerId,id_type:'ticker',value:ticker,op:'evidence_only'},'id');
   if(existing.some(k=>claimCarriesClose(k,vt)))continue;
   const cik=await cikOf(issuerId);
   const pc=pendingOf(prov.pending_change);
   if(!cik||typeof vt.as_of!=='string'||typeof vt.closing_sha256!=='string'||typeof vt.first_missing_as_of!=='string'){errors.push({code:'claim_repair_skipped',key:`${ticker}:${String(row.valid_from)}`});continue;}
   if(await fileCloseClaim(client,{issuerId,cik,ticker,replacement:pc?.replacement_tickers??[],firstMissingAsOf:vt.first_missing_as_of,asOf:vt.as_of,closingSha256:vt.closing_sha256,
    closingRawPath:typeof vt.closing_raw_path==='string'?vt.closing_raw_path:null,submissionsSha256:typeof vt.submissions_sha256==='string'?vt.submissions_sha256:null}))claims++;
  }catch(e){counts.failed++;errors.push({code:'claim_repair_error',key:ticker,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
 const skippedSummary=summarizeSkips(skipped);
 const lead:BatchError[]=claims?[{code:'claims_summary',message:JSON.stringify({evidence_only:claims})}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},pending,cleared,closed,claims};
/**
 * Load US issuers and listed securities from SEC company_tickers_exchange.json, then run
 * ticker-change detection (spec 3 §4.3.4).
 *   npx tsx scripts/entity-keys/load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]
 * Download the file separately (with a User-Agent) from https://www.sec.gov/files/company_tickers_exchange.json
 * and pass the download instant as --fetched-at (required with --apply; written to tool_versions with the
 * file sha256 and data row count).
 * --apply refuses (exit 1, no batch) when as_of or fetched_at is older than the last successful batch
 * (stale_snapshot) or the file has fewer than 90% of its data rows (incomplete_snapshot).
 * Without --apply this is a dry run: prints the plan and the snapshot check, writes nothing.
 * Closing a vanished ticker needs the CIK's SEC submissions (second source): fetched live and stored in
 * reconcile-raw (EDGAR_USER_AGENT, else DEFAULT_USER_AGENT).
 * Exit 1 when the batch failed, any row failed or any input row was rejected; 2 on bad arguments.
 * tsx does NOT load .env.local: node --env-file=.env.local --import tsx scripts/entity-keys/load-sec-issuers.ts …
 */
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {inventoryEntry} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {RECONCILE_RAW_BUCKET,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,lastSeenInReceipts,loaderOutcome,planSecLoad,priorSnapshots,recordRefusal} from '../../src/lib/entities/load-sec';
import {MAX_SEC_FILE_BYTES,parseSecCompanyTickersExchange,type SecExchangeRow} from '../../src/lib/research/entity-keys/parsers';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=SEC_DATASET;
const USAGE='usage: load-sec-issuers.ts <company_tickers_exchange.json> [--as-of YYYY-MM-DD] [--apply --fetched-at <ISO>]';

/** A YYYY-MM-DD that names a real calendar day (2026-02-30 is rejected). */
const isCalendarDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(()=>{const d=new Date(`${s}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;})();
/** An ISO-8601 instant with an explicit zone (Z or ±hh:mm). */
const isInstant=(s:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));

function parseArgs(argv:string[]):{file:string;apply:boolean;asOf:string;fetchedAt:string|null}{
 let file:string|undefined,apply=false,asOf=new Date().toISOString().slice(0,10),fetchedAt:string|null=null;
 for(let i=0;i<argv.length;i++){
  const a=argv[i];
  if(a==='--apply')apply=true;
  else if(a==='--as-of')asOf=argv[++i]??'';
  else if(a==='--fetched-at')fetchedAt=argv[++i]??'';
  else if(a.startsWith('--')){console.error(USAGE);process.exit(2);}
  else if(!file)file=a;
  else{console.error(USAGE);process.exit(2);}
 }
 if(!file||!isCalendarDate(asOf)||(fetchedAt!==null&&!isInstant(fetchedAt))||(apply&&fetchedAt===null)){console.error(USAGE);process.exit(2);}
 return {file,apply,asOf,fetchedAt};
}

async function loadPlan(client:TableClient,file:string,asOf:string){
 if(statSync(file).size>MAX_SEC_FILE_BYTES)throw new Error('file_too_large');
 const bytes=readFileSync(file);
 const parsed=parseSecCompanyTickersExchange(bytes.toString('utf8'));
 const universeRows=await selectAll(client,'stocks_universe',{market:'US'},'ticker');
 const universe=new Set(universeRows.map(r=>String(r.ticker)));
 return {parsed,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),universeSize:universe.size,plan:planSecLoad(parsed.rows,universe,asOf)};
}

async function dryRun(client:TableClient,file:string,asOf:string,fetchedAt:string|null){
 const {parsed,sha256,universeSize,plan}=await loadPlan(client,file,asOf);
 const prev=(await priorSnapshots(client,DATASET))[0]??null;
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

/** Every refusal leaves a rejected batch + a failed freshness attempt, then exits 1. */
async function refuse(client:TableClient,file:string,asOf:string,fetchedAt:string,code:string,detail:Record<string,unknown>={}):Promise<1>{
 console.error(JSON.stringify({refused:code,asOf,fetchedAt,...detail}));
 try{await recordRefusal(client,{dataset:DATASET,cadence:inventoryEntry(DATASET).cadence,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt},code,message:typeof detail.message==='string'?detail.message:undefined});}
 catch(e){console.error(`refusal receipt failed: ${errorMessage(e)}`);}
 return 1;
}
const REFUSAL_CODES=['file_too_large','too_many_rows','invalid_sec_exchange_file'];

async function apply(client:TableClient,file:string,asOf:string,fetchedAt:string):Promise<0|1>{
 let loaded:Awaited<ReturnType<typeof loadPlan>>;
 try{loaded=await loadPlan(client,file,asOf);}
 catch(e){const m=errorMessage(e);return refuse(client,file,asOf,fetchedAt,REFUSAL_CODES.includes(m)?m:'load_failed',{message:m});}
 const {parsed,bytes,sha256,plan}=loaded;
 const rows=parsed.rows.length+parsed.rejected.length;
 const prior=await priorSnapshots(client,DATASET);
 const check=checkSnapshot(prior[0]??null,{as_of:asOf,fetched_at:fetchedAt,rows});
 if(check!=='ok')return refuse(client,file,asOf,fetchedAt,check,{rows,previous:prior[0]});
 // Archive the exchange file by content hash BEFORE any dependent write; fail closed.
 const admin=getAdminSupabase();
 const raw=supabaseRawStore(admin);
 let rawPath:string;
 try{rawPath=(await raw.put({kind:'sec-tickers-exchange',bytes,contentType:'application/json',meta:{as_of:asOf,fetched_at:fetchedAt}})).path;}
 catch(e){return refuse(client,file,asOf,fetchedAt,'snapshot_archive_failed',{message:errorMessage(e)});}
 const {batchId}=await startBatch(client,{producer:'sec-company-tickers',dataset:DATASET,toolVersions:{file,as_of:asOf,fetched_at:fetchedAt,sha256,rows:String(rows),raw_path:rawPath}});
 const counts=emptyCounts();
 let errors:BatchError[]=[];
 let rejected:Record<string,number>={};
 let skipped:Record<string,number>={};
 let status:BatchStatus='failed';
 try{
  const loaded=await applySecLoad(client,plan,{asOf,batchId,batchProducerMeta:{sourceRows:rows,rejected:parsed.rejected}});
  add(counts,loaded.counts);errors=[...loaded.errors];rejected=loaded.rejectedSummary;skipped={...loaded.skippedSummary};
  // Retained snapshots (archived in earlier runs) are re-read, newest first and across ALL receipts, to find when a ticker was last really listed.
  const retained=new Map<string,SecExchangeRow[]|null>();
  const rowsOf=async(path:string)=>{
   if(!retained.has(path)){
    try{const {data,error}=await admin.storage.from(RECONCILE_RAW_BUCKET).download(path);retained.set(path,error||!data?null:parseSecCompanyTickersExchange(await data.text()).rows);}
    catch{retained.set(path,null);}
   }
   return retained.get(path)!;
  };
  const changes=await detectTickerChanges(client,{rows:parsed.rows,asOf,fetchedAt,fileSha256:sha256,batchId,snapshotPath:rawPath,rejected:parsed.rejected},{
   confirm:async cik=>{try{const s=await fetchSubmissions(cik,{fetch,raw});return {tickers:s.parsed.tickers,sha256:s.main.sha256,path:s.main.path};}catch(e){return {unavailable:errorMessage(e)};}},
   lastSeenAsOf:(cik,ticker,before)=>lastSeenInReceipts(prior,rowsOf,cik,ticker,before),
  });
  // detectTickerChanges only updates/quarantines existing rows: it adds no fetched source rows.
  changes.counts.fetched=0;
  add(counts,changes.counts);errors=[...errors,...changes.errors];
  for(const [k,v] of Object.entries(changes.skippedSummary))skipped[k]=(skipped[k]??0)+v;
 }catch(e){
  errors=[...errors,{code:'exception',message:errorMessage(e)}];
 }finally{
  try{status=await finishBatch(client,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts,rejected);
 await recordAttempt(client,DATASET,{ok:outcome.ok,cadence:inventoryEntry(DATASET).cadence});
 console.log(JSON.stringify({batchId,status,counts,skipped,rejected,errors:errors.slice(0,20)},null,1));
 return outcome.exitCode;
}

async function main(){
 const {file,apply:doApply,asOf,fetchedAt}=parseArgs(process.argv.slice(2));
 const client=supabaseTableClient(getAdminSupabase());
 if(!doApply){await dryRun(client,file,asOf,fetchedAt);return;}
 process.exitCode=await apply(client,file,asOf,fetchedAt!);
}

main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
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

exec
/bin/zsh -lc "ls node_modules/.bin/vitest 2>/dev/null; rg 'p_to_method|set_security_window' src scripts --glob '"'!*.test.ts'"'; sed -n '1050,1098p' src/lib/entities/identifiers.integration.test.ts; rg -n 'entities.sec|SEC_ENTITIES' src/lib/dq/datasets.ts; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
node_modules/.bin/vitest
src/lib/entities/windows.ts:// copy: the database merges the key atomically in set_security_window). A listing date after
src/lib/entities/windows.ts:// applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
src/lib/entities/windows.ts:   const out=await callRpc(tables,'set_security_window',c.kind==='from'
src/lib/db/memory-table-client.ts://  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window, patch_security_provenance, close_security_absent); one synchronous JS turn stands for the row lock.
src/lib/db/memory-table-client.ts: set_security_window(rowsOf,a){
src/lib/db/memory-table-client.ts:  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv)|| 'p_to_method' in a)
src/lib/db/memory-table-client.ts:   throw new TableError('rpc','set_security_window','invalid_window_write','22023');
  await q(`update public.issuer_securities set valid_from_method='ticker_change' where ticker=$1`,[c]);
  expect(await setWin(a,c,'2024-03-01','from','2020-01-01',WF)).toBe('conflict');          // method not first_observed/curated
  expect(await setWin(a,await ticker(),'2024-03-01','from','2001-08-27',WF)).toBe('not_found');
  expect(await setWin(randomUUID(),t,'2001-08-27','to','2026-06-30',WT)).toBe('not_found');
  for(const bad of [()=>setWin(a,t,'2001-08-27','from','2000-01-01',WT),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{...WF,...WT}),()=>setWin(a,t,'2001-08-27','x','2000-01-01',WF),
   ()=>setWin(a,t,'2001-08-27','from','2000-01-01',{valid_from:{url:'https://a.example/p?token=1'}}),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{isin:{}})])
   expect(await fails(bad())).toMatchObject({message:'invalid_window_write',code:'22023'});
 });
 const patchProv=(a:string,t:string,from:string,set:unknown,remove:string[],on:Pool|PoolClient=admin)=>
  on.query(`select public.patch_security_provenance($1,$2,$3::date,$4::jsonb,$5::text[]) v`,[a,t,from,JSON.stringify(set),remove]).then(r=>r.rows[0].v as string);
 const PC={pending_change:{first_missing_as_of:'2026-11-02',first_missing_sha256:'a'.repeat(64),first_missing_fetched_at:'2026-11-02T06:00:00.000Z',replacement_tickers:['NEW'],sources:['sec_company_tickers_exchange']}};
 it('patch_security_provenance: written / duplicate / not_found / invalid; set and remove only pending_change; closed rows are not found; sec_file_absent close keeps pending_change',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('written');
  expect(await patchProv(a,t,'2024-03-01',PC,[])).toBe('duplicate');
  expect((await winState(t)).provenance).toEqual({exchange:'Nasdaq',...PC});
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',PC.pending_change.first_missing_sha256,{valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}})).toBe('written');
  expect(await winState(t)).toMatchObject({valid_to:'2026-11-02',valid_to_method:'sec_file_absent',provenance:{exchange:'Nasdaq',...PC,valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}}});
  expect(await patchProv(a,t,'2024-03-01',{},['pending_change'])).toBe('not_found');   // closed
  const u=await ticker();
  await sec(a,u,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  await patchProv(a,u,'2024-03-01',PC,[]);
  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('written');
  expect(await patchProv(a,u,'2024-03-01',{},['pending_change'])).toBe('duplicate');
  expect((await winState(u)).provenance).toEqual({exchange:'Nasdaq'});
  expect(await patchProv(a,await ticker(),'2024-03-01',PC,[])).toBe('not_found');
  expect(await patchProv(randomUUID(),u,'2024-03-01',PC,[])).toBe('not_found');
  for(const bad of [()=>patchProv(a,u,'2024-03-01',{isin:'x'},[]),()=>patchProv(a,u,'2024-03-01',{},['exchange']),()=>patchProv(a,u,'2024-03-01',{pending_change:{url:'https://a.example/p?token=1'}},[]),
  ])
   expect(await fails(bad())).toMatchObject({message:expect.stringMatching(/invalid_(provenance_patch|window_write)/),code:'22023'});
  // set_security_window cannot close as sec_file_absent: there is no method argument any more
  await expect(admin.query(`select public.set_security_window($1,$2,'2024-03-01'::date,'to','2025-01-01'::date,'{"valid_to":{"source":"x"}}'::jsonb,'sec_file_absent')`,[a,u])).rejects.toThrow(/does not exist/);
 });
 const closeAbs=(a:string,t:string,from:string,to:string,sha:string,prov:unknown,on:Pool|PoolClient=admin)=>
  on.query(`select public.close_security_absent($1,$2,$3::date,$4::date,$5,$6::jsonb) v`,[a,t,from,to,sha,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
 const CV={valid_to:{source:'sec_company_tickers_exchange',as_of:'2026-11-09'}};
 it('close_security_absent: conditional on the pending marker; reappearance between read and close -> conflict; duplicate; invalid; not_found; pending_change kept',async()=>{
  const a=await issuer();const t=await ticker();
  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'Nasdaq'})});
  const sha=PC.pending_change.first_missing_sha256;
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('conflict');        // no marker yet
  await patchProv(a,t,'2024-03-01',PC,[]);
  expect(await closeAbs(a,t,'2024-03-01','2026-11-03',sha,CV)).toBe('conflict');        // marker's first_missing_as_of differs
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02','b'.repeat(64),CV)).toBe('conflict');   // another run's marker
  await patchProv(a,t,'2024-03-01',{},['pending_change']);                              // reappearance clears the marker after the run read it
  expect(await closeAbs(a,t,'2024-03-01','2026-11-02',sha,CV)).toBe('conflict');
  expect(await winState(t)).toMatchObject({valid_to:null,valid_to_method:null,provenance:{exchange:'Nasdaq'}});
  await patchProv(a,t,'2024-03-01',PC,[]);
12: entities:{sec:'entities.sec',researchLink:'entities.research-link',identifiers:'entities.identifiers',cninfo:'entities.cninfo',ahLink:'entities.ah-link',windows:'entities.windows',submissions:'entities.sec-submissions'},
34: {dataset:DATASETS.entities.sec,producer:'sec-company-tickers',cadence:'event'},
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-v5BI8n1X' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JgKVUJY3' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6b-review.md

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/entities/load-sec-ticker-change.test.ts src/lib/entities/load-sec.test.ts --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 334ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/entities/load-sec.test.ts (0 test)
 ❯ src/lib/entities/load-sec-ticker-change.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/entities/load-sec-ticker-change.test.ts [ src/lib/entities/load-sec-ticker-change.test.ts ]
 FAIL  src/lib/entities/load-sec.test.ts [ src/lib/entities/load-sec.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/dvvGMNij-UzyhSfWO4Lhf/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  01:33:45
   Duration  213ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions introduced by this commit were identified. The targeted tests could not run because the read-only sandbox prevented Vitest from creating temporary directories.
No actionable regressions introduced by this commit were identified. The targeted tests could not run because the read-only sandbox prevented Vitest from creating temporary directories.

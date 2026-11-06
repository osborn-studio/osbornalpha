OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b009-0e1a-73b1-98e0-aa378fa217bd
--------
user
commit 1f679ac
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1f679ac; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 524ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-OoxtMoF2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DzR0zLbE' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bLujQ8lG' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-embZQDpg' (errno=Operation not permitted)
1f679ac feat(entities): evidenced listing/delisting window backfill via atomic set_security_window, conflicts quarantined; E2 coverage segment
 scripts/entity-keys/backfill-windows.ts            |  62 ++++++++++++
 scripts/entity-keys/coverage.ts                    |  62 ++++++++----
 src/lib/db/memory-table-client.ts                  |  23 ++++-
 src/lib/entities/backfill-windows.test.ts          |  80 +++++++++++++++
 src/lib/entities/coverage.test.ts                  |  19 +++-
 src/lib/entities/coverage.ts                       |  16 +++
 src/lib/entities/identifiers.integration.test.ts   |  59 +++++++++++-
 src/lib/entities/windows.ts                        | 107 +++++++++++++++++++++
 supabase/migrations.lock.json                      |   2 +-
 .../20261107090000_identifiers_and_dq.sql          |  45 +++++++++
 10 files changed, 452 insertions(+), 23 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in . .. ../.. ../../.. ../../../.. ../../../../..; do ls "$p"/AGENTS* "$p"/CLAUDE.md 2>/dev/null; done; git show 1f679ac -- src/lib/entities/windows.ts scripts/entity-keys/backfill-windows.ts scripts/entity-keys/coverage.ts src/lib/entities/coverage.ts src/lib/db/memory-table-client.ts supabase/migrations/20261107090000_identifiers_and_dq.sql' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
zsh:1: no matches found: ../../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0hgseKiH' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-i6NO0tkq' (errno=Operation not permitted)
commit 1f679acbf13b3beda894e82606c4e9a4aeb0dd5c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:45:25 2026 -0800

    feat(entities): evidenced listing/delisting window backfill via atomic set_security_window, conflicts quarantined; E2 coverage segment
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/backfill-windows.ts b/scripts/entity-keys/backfill-windows.ts
new file mode 100644
index 0000000..dc5568f
--- /dev/null
+++ b/scripts/entity-keys/backfill-windows.ts
@@ -0,0 +1,62 @@
+/**
+ * Evidenced holding windows (spec §4.3.2): earliest row per ticker → stocks_universe.list_date,
+ * latest open row → delist_date; conflicts are quarantined. A-share and HK universe rows only
+ * (US carries no list_date).
+ *   npx tsx scripts/entity-keys/backfill-windows.ts [--apply]
+ * Dry run (default): prints the plan, writes nothing. --apply records an ingest batch (dataset
+ * entities.windows) and a freshness attempt.
+ * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
+ */
+import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
+import {SEC_ROW_KEY,WINDOWS_RULES_VERSION,applyWindowBackfill,keysetAll,planWindowBackfill,type UniverseDates,type WindowRow} from '../../src/lib/entities/windows';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const DATASET=DATASETS.entities.windows;
+const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
+const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
+
+async function load(tables:TableClient){
+ const rows:WindowRow[]=(await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY)).map(r=>({
+  issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),valid_to:str(r.valid_to),
+  valid_from_method:String(r.valid_from_method),valid_to_method:str(r.valid_to_method),
+  provenance:(r.provenance&&typeof r.provenance==='object'?r.provenance:{}) as Record<string,unknown>,
+ }));
+ const universe=new Map<string,UniverseDates>();
+ for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))
+  universe.set(String(r.ticker),{ticker:String(r.ticker),list_date:str(r.list_date),delist_date:str(r.delist_date),source:str(r.source),source_updated_at:str(r.source_updated_at)});
+ return {rows:rows.filter(r=>universe.has(r.ticker)),universe};
+}
+
+async function main(){
+ const argv=process.argv.slice(2);
+ if(argv.some(a=>a!=='--apply')){console.error('usage: backfill-windows.ts [--apply]');process.exit(2);}
+ const tables=supabaseTableClient(getAdminSupabase());
+ const asOf=new Date().toISOString().slice(0,10);
+ if(!argv.includes('--apply')){
+  const {rows,universe}=await load(tables);
+  const plan=planWindowBackfill(rows,universe,asOf);
+  console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',rows:rows.length,
+   changes:{from:plan.changes.filter(c=>c.kind==='from').length,to:plan.changes.filter(c=>c.kind==='to').length},
+   conflicts:plan.conflicts.length,unchanged:plan.unchanged,firstConflicts:plan.conflicts.slice(0,10).map(c=>({ticker:c.row.ticker,valid_from:c.row.valid_from,reason:c.reason}))},null,1));
+  return;
+ }
+ const {batchId}=await startBatch(tables,{producer:'backfill-windows',dataset:DATASET,toolVersions:{rules:WINDOWS_RULES_VERSION,as_of:asOf}});
+ let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
+ try{
+  const {rows,universe}=await load(tables);
+  ({counts,errors}=await applyWindowBackfill(tables,planWindowBackfill(rows,universe,asOf),{batchId,dataset:DATASET}));
+ }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
+ finally{
+  try{status=await finishBatch(tables,batchId,{counts,errors});}
+  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
+ }
+ const outcome=loaderOutcome(status,counts);
+ await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
+ console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
+ process.exitCode=outcome.exitCode;
+}
+main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
diff --git a/scripts/entity-keys/coverage.ts b/scripts/entity-keys/coverage.ts
index 6ed9f2f..8153dbc 100644
--- a/scripts/entity-keys/coverage.ts
+++ b/scripts/entity-keys/coverage.ts
@@ -1,41 +1,65 @@
 /**
  * Success-criteria measurements (spec §1.1). Read-only.
- *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|all] [--out <file.md>]
+ *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|windows|all] [--out <file.md>]
  * E1: FIGI/ISIN coverage of open security rows of US in-scope issuers (targets 95% / 90%).
- * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/e1-<date>.md).
+ * windows (E2): research-queue A/H rows — backfillable rows at listing_date (target 100%), with the
+ * non-backfillable and open-quarantine counts reported separately. The research queue is
+ * research_entity_keys with in_scope = true and a linked issuer_id (Part B contract issue 10).
+ * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/coverage-<date>.md).
  */
 import {writeFileSync} from 'node:fs';
-import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
-import {coverageE1,type E1Result} from '../../src/lib/entities/coverage';
+import {selectAll,supabaseTableClient,type TableClient} from '../../src/lib/db/table-client';
+import {DATASETS} from '../../src/lib/dq/datasets';
+import {coverageE1,coverageE2,type E1Result,type E2Result} from '../../src/lib/entities/coverage';
 import {errorMessage} from '../../src/lib/entities/load-sec';
+import {SEC_ROW_KEY,keysetAll} from '../../src/lib/entities/windows';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
+const USAGE='usage: coverage.ts [--segment e1|windows|all] [--out <file.md>]';
 function args(argv:string[]){
  let segment='all',out:string|null=null;
  for(let i=0;i<argv.length;i++){
   if(argv[i]==='--segment')segment=argv[++i]??'';
-  else if(argv[i]==='--out')out=argv[++i]??null;
-  else{console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
+  else if(argv[i]==='--out')out=argv[++i]??'';
+  else{console.error(USAGE);process.exit(2);}
  }
- if(!['e1','all'].includes(segment)||(argv.includes('--out')&&!out)){console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
+ if(!['e1','windows','all'].includes(segment)||out===''){console.error(USAGE);process.exit(2);}
  return {segment,out};
 }
-const e1Markdown=(r:E1Result,at:string)=>[
- `## E1 · 标识符覆盖（${at}）`,'','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
- `| FIGI（美股范围发行人未关闭行） | ${r.figi.num} | ${r.figi.den} | ${r.figi.pct??'—'} | 95% | ${r.passes.figi?'是':'否'} |`,
- `| ISIN（其中发行人有 LEI 的行） | ${r.isin.num} | ${r.isin.den} | ${r.isin.pct??'—'} | 90% | ${r.passes.isin?'是':'否'} |`,'',
-].join('\n');
 
-async function main(){
- const {out}=args(process.argv.slice(2));
- const tables=supabaseTableClient(getAdminSupabase());
- const at=new Date().toISOString();
- const e1=coverageE1({
+async function e1(tables:TableClient){
+ return coverageE1({
   scope:await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id'),
   securities:await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'),
   issuers:await selectAll(tables,'issuers',{},'issuer_id'),
  });
- console.log(JSON.stringify({at,e1},null,1));
- if(out)writeFileSync(out,e1Markdown(e1,at));
+}
+async function windows(tables:TableClient){
+ const rows=await keysetAll(tables,'issuer_securities',{},{},'ticker',SEC_ROW_KEY);
+ const listDates=new Map<string,string|null>();
+ for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))listDates.set(String(r.ticker),typeof r.list_date==='string'?r.list_date:null);
+ const queue=new Set((await keysetAll(tables,'research_entity_keys',{in_scope:true},{},'entity_id',['user_id','entity_id'])).map(r=>r.issuer_id).filter((v):v is string=>typeof v==='string'));
+ const open=await selectAll(tables,'dq_quarantine',{status:'open',dataset:DATASETS.entities.windows},'id');
+ const keys=new Set(open.filter(q=>q.reason_code==='window_evidence_conflict'||q.reason_code==='ownership_conflict').map(q=>String(q.natural_key)));
+ return coverageE2({rows,listDates,queueIssuers:queue,openQuarantineKeys:keys});
+}
+const md=(at:string,a:E1Result|null,b:E2Result|null)=>[
+ `# 覆盖度量（${at}）`,'',
+ ...(a?['## E1 · 标识符覆盖','','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
+  `| FIGI（美股范围发行人未关闭行） | ${a.figi.num} | ${a.figi.den} | ${a.figi.pct??'—'} | 95% | ${a.passes.figi?'是':'否'} |`,
+  `| ISIN（其中发行人有 LEI 的行） | ${a.isin.num} | ${a.isin.den} | ${a.isin.pct??'—'} | 90% | ${a.passes.isin?'是':'否'} |`,'']:[]),
+ ...(b?['## E2 · 持有区间（研究队列 A/H 行）','','| 指标 | 值 |','|---|---|',
+  `| 可回填行中 listing_date | ${b.backfillable.num} / ${b.backfillable.den}（${b.backfillable.pct??'—'}%，目标 100%，${b.passes?'达标':'未达标'}） |`,
+  `| 不可回填行 | ${b.not_backfillable} |`,`| open 隔离项（window_evidence_conflict / ownership_conflict） | ${b.open_quarantine} |`,'']:[]),
+].join('\n');
+
+async function main(){
+ const {segment,out}=args(process.argv.slice(2));
+ const tables=supabaseTableClient(getAdminSupabase());
+ const at=new Date().toISOString();
+ const a=segment==='windows'?null:await e1(tables);
+ const b=segment==='e1'?null:await windows(tables);
+ console.log(JSON.stringify({at,e1:a,windows:b},null,1));
+ if(out)writeFileSync(out,md(at,a,b));
 }
 main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 8c89d9f..471e623 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,7 +8,7 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
-//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier); one synchronous JS turn stands for the row lock.
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier, set_security_window); one synchronous JS turn stands for the row lock.
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -73,6 +73,27 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   row.updated_at=new Date().toISOString();
   return 'written';
  },
+ // Task 5a: guarded evidenced-window write (date + method + one provenance key). Not mirrored: claim_provenance_safe and the no-overlap exclusion (DB suite).
+ set_security_window(rowsOf,a){
+  const side=a.p_side,pv=a.p_provenance,nd=a.p_new_date;
+  if((side!=='from'&&side!=='to')||typeof nd!=='string'||!isObj(pv)||Object.keys(pv).length!==1||!(`valid_${side}` in pv))
+   throw new TableError('rpc','set_security_window','invalid_window_write','22023');
+  const row=rowsOf('issuer_securities').find(r=>r.issuer_id===a.p_issuer&&r.ticker===a.p_ticker&&r.valid_from===a.p_valid_from);
+  if(!row)return 'not_found';
+  const prov=isObj(row.provenance)?row.provenance:{};
+  if(side==='from'){
+   if(row.valid_from_method==='listing_date'&&row.valid_from===nd&&'valid_from' in prov)return 'duplicate';
+   if((row.valid_from_method!=='first_observed'&&row.valid_from_method!=='curated')||nd>String(row.valid_from))return 'conflict';
+   if(row.valid_to!=null&&nd>=String(row.valid_to))return 'conflict';
+   row.valid_from=nd;row.valid_from_method='listing_date';
+  }else{
+   if(row.valid_to===nd&&row.valid_to_method==='delisting'&&'valid_to' in prov)return 'duplicate';
+   if(row.valid_to!=null||nd<=String(row.valid_from))return 'conflict';
+   row.valid_to=nd;row.valid_to_method='delisting';
+  }
+  row.provenance={...prov,...clone(pv)};
+  return 'written';
+ },
  set_security_identifier(rowsOf,a){
   const col=a.p_column,v=a.p_value,pv=a.p_provenance;
   if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
diff --git a/src/lib/entities/coverage.ts b/src/lib/entities/coverage.ts
index 8639272..06a00ac 100644
--- a/src/lib/entities/coverage.ts
+++ b/src/lib/entities/coverage.ts
@@ -24,3 +24,19 @@ export function coverageE1(input:{scope:readonly Row[];securities:readonly Row[]
  const isin=ratio(isinRows.filter(s=>s.isin!=null).length,isinRows.length);
  return {figi,isin,passes:{figi:meetsThreshold(figi,95),isin:meetsThreshold(isin,90)}};
 }
+
+export interface E2Result{backfillable:Ratio;not_backfillable:number;open_quarantine:number;passes:boolean}
+/**
+ * E2 (spec §1.1): research-queue A/H rows. Backfillable = the earliest row of its ticker in this
+ * database, stocks_universe.list_date non-null, and no open window_evidence_conflict /
+ * ownership_conflict item keyed `${ticker}:${valid_from}`. Target: 100% listing_date.
+ */
+export function coverageE2(input:{rows:readonly Row[];listDates:ReadonlyMap<string,string|null>;queueIssuers:ReadonlySet<string>;openQuarantineKeys:ReadonlySet<string>}):E2Result{
+ const earliest=new Map<string,string>();
+ for(const r of input.rows){const t=String(r.ticker),vf=String(r.valid_from);const e=earliest.get(t);if(e===undefined||vf<e)earliest.set(t,vf);}
+ const key=(r:Row)=>`${r.ticker}:${r.valid_from}`;
+ const ah=input.rows.filter(r=>/\.(SH|SZ|HK)$/.test(String(r.ticker))&&input.queueIssuers.has(String(r.issuer_id)));
+ const back=ah.filter(r=>earliest.get(String(r.ticker))===String(r.valid_from)&&!!input.listDates.get(String(r.ticker))&&!input.openQuarantineKeys.has(key(r)));
+ const backfillable=ratio(back.filter(r=>r.valid_from_method==='listing_date').length,back.length);
+ return {backfillable,not_backfillable:ah.length-back.length,open_quarantine:ah.filter(r=>input.openQuarantineKeys.has(key(r))).length,passes:backfillable.den>0&&backfillable.num===backfillable.den};
+}
diff --git a/src/lib/entities/windows.ts b/src/lib/entities/windows.ts
new file mode 100644
index 0000000..f5bfc7e
--- /dev/null
+++ b/src/lib/entities/windows.ts
@@ -0,0 +1,107 @@
+// src/lib/entities/windows.ts
+// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
+// the EARLIEST holding row's valid_from to stocks_universe.list_date (method listing_date) and
+// closes the LATEST open row at delist_date (method delisting), copying the exact source-row
+// values into a SINGLE provenance key (never a reference to the mutable universe table, never a whole-object
+// copy: the database merges the key atomically in set_security_window). A listing date after
+// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
+// (quarantined, row unchanged). US tickers carry no list_date and are left as first_observed.
+// applyWindowBackfill writes through the guarded RPC set_security_window; exclusion/unique violations become ownership_conflict.
+import {MAX_PAGE,callRpc,type RangeOptions,type Row,type TableClient} from '../db/table-client';
+import {emptyCounts,type BatchError} from '../dq/batches';
+import {isUnique} from './claims';
+import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
+import {sanitizeProvenance} from './provenance';
+
+export const WINDOWS_RULES_VERSION='windows/1';
+export const SEC_ROW_KEY=['issuer_id','ticker','valid_from'] as const;
+export interface UniverseDates{ticker:string;list_date:string|null;delist_date:string|null;source:string|null;source_updated_at:string|null}
+export interface WindowRow{issuer_id:string;ticker:string;valid_from:string;valid_to:string|null;valid_from_method:string;valid_to_method:string|null;provenance:Record<string,unknown>}
+export type WindowChange=
+ |{kind:'from';row:WindowRow;newValidFrom:string;provenance:Record<string,unknown>}
+ |{kind:'to';row:WindowRow;validFrom:string;newValidTo:string;provenance:Record<string,unknown>};
+export interface WindowConflict{row:WindowRow;reason:'list_date_after_first_observed'|'delist_on_or_before_valid_from';detail:Record<string,unknown>}
+export interface WindowPlan{changes:WindowChange[];conflicts:WindowConflict[];unchanged:number;skipped:string[]}
+
+/**
+ * Pages a table by a NON-unique order column with gte cursors, de-duplicating on keyCols (same
+ * approach as the private helper in facts/scope.ts). A single order value with more than MAX_PAGE
+ * rows cannot be paged and throws keyset_tie_group_overflow.
+ */
+export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
+ const seen=new Set<string>(),out:Row[]=[];
+ let cursor:string|null=null;
+ for(;;){
+  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
+  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
+  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
+  if(page.length<MAX_PAGE)return out;
+  const last=String(page[page.length-1][orderBy]);
+  if(last===cursor)throw new Error('keyset_tie_group_overflow');
+  cursor=last;
+ }
+}
+
+const byFrom=(a:WindowRow,b:WindowRow)=>a.valid_from<b.valid_from?-1:a.valid_from>b.valid_from?1:0;
+
+export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
+ const byTicker=new Map<string,WindowRow[]>();
+ for(const r of rows){const l=byTicker.get(r.ticker)??[];l.push(r);byTicker.set(r.ticker,l);}
+ const plan:WindowPlan={changes:[],conflicts:[],unchanged:0,skipped:[]};
+ for(const ticker of [...byTicker.keys()].sort()){
+  const list=[...byTicker.get(ticker)!].sort(byFrom);
+  const u=universe.get(ticker);
+  if(!u){plan.skipped.push('not_in_universe');continue;}
+  const first=list[0],last=list[list.length-1];
+  let firstFrom=first.valid_from;
+  if(u.list_date===null)plan.skipped.push('no_list_date');
+  else if(first.valid_from_method==='listing_date')plan.unchanged++;
+  else if(first.valid_from_method!=='first_observed'&&first.valid_from_method!=='curated')plan.skipped.push(`method_${first.valid_from_method}`);
+  else if(u.list_date>first.valid_from)plan.conflicts.push({row:first,reason:'list_date_after_first_observed',detail:{list_date:u.list_date,valid_from:first.valid_from,source:u.source}});
+  else{
+   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
+   firstFrom=u.list_date;
+   plan.changes.push({kind:'from',row:first,newValidFrom:firstFrom,provenance});
+  }
+  if(u.delist_date!==null&&last.valid_to===null){
+   const vf=last===first?firstFrom:last.valid_from;
+   if(u.delist_date<=vf)plan.conflicts.push({row:last,reason:'delist_on_or_before_valid_from',detail:{delist_date:u.delist_date,valid_from:vf,source:u.source}});
+   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
+  }
+ }
+ plan.skipped.sort();
+ return plan;
+}
+
+export async function applyWindowBackfill(tables:TableClient,plan:WindowPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult>{
+ const counts=emptyCounts();const errors:BatchError[]=[];
+ counts.duplicates=plan.unchanged;
+ const keyOf=(r:WindowRow)=>`${r.ticker}:${r.valid_from}`;
+ const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
+  dataset:opts.dataset,table:'issuer_securities',naturalKey:keyOf(r),reasonCode:reason,detail,
+  payload:{issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from,valid_to:r.valid_to,valid_from_method:r.valid_from_method},batchId:opts.batchId,
+ },counts,errors,{code:reason,key:keyOf(r)});
+ const blocked=new Set<string>();
+ for(const c of plan.changes){
+  const id=`${c.row.issuer_id}|${keyOf(c.row)}`;
+  if(c.kind==='to'&&blocked.has(id)){counts.failed++;errors.push({code:'blocked_by_from_change',key:keyOf(c.row)});continue;}
+  try{
+   const out=await callRpc(tables,'set_security_window',c.kind==='from'
+    ?{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.row.valid_from,p_side:'from',p_new_date:c.newValidFrom,p_provenance:c.provenance}
+    :{p_issuer:c.row.issuer_id,p_ticker:c.row.ticker,p_valid_from:c.validFrom,p_side:'to',p_new_date:c.newValidTo,p_provenance:c.provenance});
+   if(out==='written'){counts.versioned++;continue;}
+   if(out==='duplicate'){counts.duplicates++;continue;}
+   if(c.kind==='from')blocked.add(id);
+   counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
+  }catch(e){
+   if(c.kind==='from')blocked.add(id);
+   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
+   counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
+  }
+ }
+ for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
+ counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
+ const skippedSummary:Record<string,number>={};
+ for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
+ return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,rejectedSummary:{}};
+}
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index d4b2e2b..5175c09 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -795,6 +795,51 @@ end $$;
 revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
 grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
 
+-- ---------------------------------------------------------------- guarded evidenced-window write (Task 5a)
+-- set_security_window is the only writer of an evidenced valid_from / valid_to (windows.ts, backfill-windows).
+-- Lock order of set_security_identifier / resolve_identifier_claim: issuer FOR SHARE, then the row FOR UPDATE.
+-- p_side 'from': the row (issuer, ticker, p_valid_from) must still have method first_observed or curated and
+--   p_new_date <= valid_from; ONE UPDATE sets valid_from = p_new_date, valid_from_method = 'listing_date'.
+-- p_side 'to': the row (issuer, ticker, p_valid_from) must still be open and p_new_date > valid_from; ONE UPDATE
+--   sets valid_to, valid_to_method = 'delisting'.
+-- Both merge `provenance || p_provenance` (never a whole-object replacement); p_provenance must be public-safe
+-- (claim_provenance_safe) and hold exactly the key valid_from / valid_to matching p_side.
+-- Outcomes: 'written', 'duplicate' (already evidenced at p_new_date with the key present), 'conflict' (state moved
+-- or date rule violated; nothing written), 'not_found'. Exclusion / unique violations (23P01 / 23505) pass through.
+create or replace function public.set_security_window(p_issuer uuid, p_ticker text, p_valid_from date, p_side text, p_new_date date, p_provenance jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare v_row public.issuer_securities%rowtype; n int;
+begin
+  if p_side is null or p_side not in ('from', 'to') or p_new_date is null or p_ticker is null or p_valid_from is null
+     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
+     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array['valid_' || p_side]
+     or not public.claim_provenance_safe(p_provenance) then
+    raise exception 'invalid_window_write' using errcode = '22023';
+  end if;
+  perform 1 from public.issuers where issuer_id = p_issuer for share;
+  if not found then return 'not_found'; end if;
+  select * into v_row from public.issuer_securities s
+  where s.issuer_id = p_issuer and s.ticker = p_ticker and s.valid_from = p_valid_from for update;
+  if not found then return 'not_found'; end if;
+  if p_side = 'from' then
+    if v_row.valid_from_method = 'listing_date' and v_row.valid_from = p_new_date and v_row.provenance ? 'valid_from' then return 'duplicate'; end if;
+    if v_row.valid_from_method not in ('first_observed', 'curated') or p_new_date > v_row.valid_from then return 'conflict'; end if;
+    if v_row.valid_to is not null and p_new_date >= v_row.valid_to then return 'conflict'; end if;
+    update public.issuer_securities set valid_from = p_new_date, valid_from_method = 'listing_date', provenance = provenance || p_provenance
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_from_method in ('first_observed', 'curated');
+  else
+    if v_row.valid_to = p_new_date and v_row.valid_to_method = 'delisting' and v_row.provenance ? 'valid_to' then return 'duplicate'; end if;
+    if v_row.valid_to is not null or p_new_date <= v_row.valid_from then return 'conflict'; end if;
+    update public.issuer_securities set valid_to = p_new_date, valid_to_method = 'delisting', provenance = provenance || p_provenance
+    where issuer_id = p_issuer and ticker = p_ticker and valid_from = p_valid_from and valid_to is null;
+  end if;
+  get diagnostics n = row_count;
+  if n <> 1 then return 'conflict'; end if;
+  return 'written';
+end $$;
+revoke execute on function public.set_security_window(uuid, text, date, text, date, jsonb) from public, anon, authenticated;
+grant execute on function public.set_security_window(uuid, text, date, text, date, jsonb) to service_role;
+
 -- ---------------------------------------------------------------- guarded issuer identifier write (Task 4b review, P1)
 -- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim
 -- (cninfo-org-id.ts). It locks the issuer row FOR NO KEY UPDATE (the order and lock level of

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find . -name CLAUDE.md -o -name AGENTS.md -o -name AGENTS.override.md; git show 1f679ac -- src/lib/entities/backfill-windows.test.ts src/lib/entities/coverage.test.ts src/lib/entities/identifiers.integration.test.ts; rg -n '4.3.2|E2|window_evidence_conflict|valid_from.*references|references.*issuer_securities' docs src supabase | head -65" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 57ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xpICmfjm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-V2pX8w0f' (errno=Operation not permitted)
commit 1f679acbf13b3beda894e82606c4e9a4aeb0dd5c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:45:25 2026 -0800

    feat(entities): evidenced listing/delisting window backfill via atomic set_security_window, conflicts quarantined; E2 coverage segment
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/backfill-windows.test.ts b/src/lib/entities/backfill-windows.test.ts
new file mode 100644
index 0000000..b52bc07
--- /dev/null
+++ b/src/lib/entities/backfill-windows.test.ts
@@ -0,0 +1,80 @@
+// src/lib/entities/backfill-windows.test.ts
+import {describe,it,expect} from 'vitest';
+import {TableError,type TableClient} from '../db/table-client';
+import {memoryTableClient} from '../db/memory-table-client';
+import {applyWindowBackfill,planWindowBackfill,type UniverseDates,type WindowRow} from './windows';
+
+const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.windows';
+const w=(o:Partial<WindowRow>):WindowRow=>({issuer_id:'i1',ticker:'600519.SH',valid_from:'2024-03-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,provenance:{source:'curated'},...o});
+const u=(ticker:string,o:Partial<UniverseDates>={}):[string,UniverseDates]=>[ticker,{ticker,list_date:'2001-08-27',delist_date:null,source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z',...o}];
+const FROM_PROV={source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:ASOF,row:{list_date:'2001-08-27',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}};
+
+describe('planWindowBackfill',()=>{
+ it('moves the earliest row to the listing date, copying the source row values into provenance',()=>{
+  const p=planWindowBackfill([w({})],new Map([u('600519.SH')]),ASOF);
+  expect(p.changes).toEqual([{kind:'from',row:w({}),newValidFrom:'2001-08-27',provenance:{valid_from:FROM_PROV}}]);
+  expect(p.conflicts).toEqual([]);
+ });
+ it('equal dates change only the method and provenance; a later listing date is a conflict',()=>{
+  expect(planWindowBackfill([w({valid_from:'2001-08-27'})],new Map([u('600519.SH')]),ASOF).changes[0]).toMatchObject({kind:'from',newValidFrom:'2001-08-27'});
+  const late=planWindowBackfill([w({valid_from:'2000-01-01'})],new Map([u('600519.SH')]),ASOF);
+  expect(late.changes).toEqual([]);
+  expect(late.conflicts).toEqual([{row:w({valid_from:'2000-01-01'}),reason:'list_date_after_first_observed',detail:{list_date:'2001-08-27',valid_from:'2000-01-01',source:'tushare_stock_basic'}}]);
+ });
+ it('touches only the earliest holding row of a ticker; curated rows qualify, other methods do not',()=>{
+  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
+  const p=planWindowBackfill(rows,new Map([u('600519.SH')]),ASOF);
+  expect(p.changes.map(c=>[c.kind,c.row.issuer_id])).toEqual([['from','i2']]);
+  expect(planWindowBackfill([w({valid_from_method:'curated'})],new Map([u('600519.SH')]),ASOF).changes).toHaveLength(1);
+  const done=planWindowBackfill([w({valid_from:'2001-08-27',valid_from_method:'listing_date'})],new Map([u('600519.SH')]),ASOF);
+  expect(done.changes).toEqual([]);expect(done.unchanged).toBe(1);
+  expect(planWindowBackfill([w({valid_from_method:'ticker_change'})],new Map([u('600519.SH')]),ASOF).skipped).toEqual(['method_ticker_change']);
+ });
+ it('closes the latest open row at the delisting date; a delisting on or before valid_from is a conflict',()=>{
+  const rows=[w({issuer_id:'i2',valid_from:'2010-01-01',valid_to:'2015-01-01'}),w({issuer_id:'i1',valid_from:'2015-01-01'})];
+  const p=planWindowBackfill(rows,new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
+  const to=p.changes.find(c=>c.kind==='to')!;
+  expect(to).toMatchObject({kind:'to',validFrom:'2015-01-01',newValidTo:'2026-06-30',provenance:{valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:ASOF,row:{delist_date:'2026-06-30',source:'tushare_stock_basic',source_updated_at:'2026-11-01T00:00:00Z'}}}});
+  const bad=planWindowBackfill([w({valid_from:'2024-03-01'})],new Map([u('600519.SH',{list_date:null,delist_date:'2024-03-01'})]),ASOF);
+  expect(bad.conflicts.map(c=>c.reason)).toEqual(['delist_on_or_before_valid_from']);
+ });
+ it('a single row gets both changes; the close uses the new valid_from and keeps the listing provenance',()=>{
+  const p=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
+  expect(p.changes.map(c=>c.kind)).toEqual(['from','to']);
+  const to=p.changes[1] as Extract<typeof p.changes[number],{kind:'to'}>;
+  expect(to.validFrom).toBe('2001-08-27');
+  expect(Object.keys(to.provenance)).toEqual(['valid_to']);
+  expect(Object.keys((p.changes[0] as {provenance:object}).provenance)).toEqual(['valid_from']);
+ });
+ it('leaves US rows (no list_date) and tickers outside the universe alone',()=>{
+  const p=planWindowBackfill([w({ticker:'AAPL'}),w({ticker:'ZZZZ'})],new Map([u('AAPL',{list_date:null})]),ASOF);
+  expect(p.changes).toEqual([]);expect(p.skipped).toEqual(['no_list_date','not_in_universe']);
+ });
+});
+
+describe('applyWindowBackfill',()=>{
+ const row=(o:Partial<WindowRow>={})=>({...w(o),isin:null,figi:null,share_class:'A',is_primary:true,source:'curated'});
+ it('applies guarded updates and quarantines evidence conflicts',async()=>{
+  const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuer_securities',row({}));
+  await c.insert('issuer_securities',row({ticker:'000001.SZ',valid_from:'1980-01-01'}));
+  const plan=planWindowBackfill([w({}),w({ticker:'000001.SZ',valid_from:'1980-01-01'})],new Map([u('600519.SH',{delist_date:'2026-06-30'}),u('000001.SZ',{list_date:'1991-04-03'})]),ASOF);
+  const res=await applyWindowBackfill(c,plan,{batchId:BATCH,dataset:DATASET});
+  const moved=c.rows('issuer_securities').find(r=>r.ticker==='600519.SH')!;
+  expect(moved).toMatchObject({valid_from:'2001-08-27',valid_from_method:'listing_date',valid_to:'2026-06-30',valid_to_method:'delisting'});
+  expect(Object.keys(moved.provenance as object).sort()).toEqual(['source','valid_from','valid_to']);
+  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'000001.SZ:1980-01-01',reason_code:'window_evidence_conflict',status:'open'})]);
+  expect(res.counts).toMatchObject({fetched:3,versioned:2,quarantined:1,failed:0});
+ });
+ it('an exclusion violation is an ownership_conflict and blocks the same row\'s close',async()=>{
+  const c=memoryTableClient({dq_quarantine:['id']});
+  await c.insert('issuer_securities',row({}));
+  const failing:TableClient={...c,rpc:async(fn,args)=>{if(fn==='set_security_window'&&args.p_side==='from')throw new TableError('rpc',fn,'conflicting key value violates exclusion constraint "issuer_securities_no_overlap"','23P01');return c.rpc(fn,args);}};
+  const plan=planWindowBackfill([w({})],new Map([u('600519.SH',{delist_date:'2026-06-30'})]),ASOF);
+  const res=await applyWindowBackfill(failing,plan,{batchId:BATCH,dataset:DATASET});
+  expect(c.rows('dq_quarantine').map(q=>q.reason_code)).toEqual(['ownership_conflict']);
+  expect(c.rows('issuer_securities')[0]).toMatchObject({valid_from:'2024-03-01',valid_to:null});
+  expect(res.counts).toMatchObject({quarantined:1,failed:1,versioned:0});
+  expect(res.errors.map(e=>e.code)).toEqual(['ownership_conflict','blocked_by_from_change']);
+ });
+});
diff --git a/src/lib/entities/coverage.test.ts b/src/lib/entities/coverage.test.ts
index f520481..004b6d1 100644
--- a/src/lib/entities/coverage.test.ts
+++ b/src/lib/entities/coverage.test.ts
@@ -1,6 +1,6 @@
 // src/lib/entities/coverage.test.ts
 import {describe,it,expect} from 'vitest';
-import {coverageE1,meetsThreshold,ratio} from './coverage';
+import {coverageE1,coverageE2,meetsThreshold,ratio} from './coverage';
 
 describe('ratio',()=>{
  it('formats a truncated two-decimal percentage with integer arithmetic and null for an empty denominator',()=>{
@@ -29,3 +29,20 @@ describe('coverageE1',()=>{
   });
  });
 });
+
+describe('coverageE2',()=>{
+ it('counts research-queue A/H earliest rows with a list_date and no open quarantine; reports the rest separately',()=>{
+  const rows=[
+   {issuer_id:'q',ticker:'600519.SH',valid_from:'2001-08-27',valid_from_method:'listing_date'},
+   {issuer_id:'q',ticker:'000001.SZ',valid_from:'2024-01-01',valid_from_method:'first_observed'},
+   {issuer_id:'q',ticker:'00700.HK',valid_from:'2024-01-01',valid_from_method:'first_observed'},
+   {issuer_id:'q',ticker:'600000.SH',valid_from:'2020-01-01',valid_from_method:'first_observed'},
+   {issuer_id:'old',ticker:'600000.SH',valid_from:'2010-01-01',valid_from_method:'first_observed'},
+   {issuer_id:'q',ticker:'AAPL',valid_from:'2024-01-01',valid_from_method:'first_observed'},
+   {issuer_id:'other',ticker:'601318.SH',valid_from:'2024-01-01',valid_from_method:'first_observed'},
+  ];
+  const listDates=new Map([['600519.SH','2001-08-27'],['000001.SZ','1991-04-03'],['00700.HK','2004-06-16'],['600000.SH','1999-11-10'],['601318.SH','2007-03-01']]);
+  const r=coverageE2({rows,listDates,queueIssuers:new Set(['q']),openQuarantineKeys:new Set(['00700.HK:2024-01-01'])});
+  expect(r).toEqual({backfillable:{num:1,den:2,pct:'50.00'},not_backfillable:2,open_quarantine:1,passes:false});
+ });
+});
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 1e8a001..7b6b549 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)','public.set_security_window(uuid,text,date,text,date,jsonb)'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -1025,6 +1025,63 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   });
   expect(await secState(t)).toEqual({isin,figi:'BBG000000001',provenance:{exchange:'Nasdaq',...PI}});
  });
+
+ // Task 5a: evidenced window writes land date + method + one provenance key in one locked UPDATE.
+ const setWin=(a:string,t:string,from:string,side:string,date:string,prov:unknown,on:Pool|PoolClient=admin)=>
+  on.query(`select public.set_security_window($1,$2,$3::date,$4,$5::date,$6::jsonb) v`,[a,t,from,side,date,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
+ const winState=async(t:string)=>(await q(`select to_char(valid_from,'YYYY-MM-DD') valid_from,to_char(valid_to,'YYYY-MM-DD') valid_to,valid_from_method,valid_to_method,provenance from public.issuer_securities where ticker=$1`,[t]))[0];
+ const WF={valid_from:{source:'stocks_universe.list_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{list_date:'2001-08-27'}}};
+ const WT={valid_to:{source:'stocks_universe.delist_date',provider:'tushare_stock_basic',as_of:'2026-11-05',row:{delist_date:'2026-06-30'}}};
+ it('set_security_window: from/to written, duplicate, state guards conflict, not_found, invalid; provenance merged',async()=>{
+  const a=await issuer();const t=await ticker();
+  await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'SSE'})});
+  expect(await setWin(a,t,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // listing date after valid_from
+  expect(await setWin(a,t,'2024-03-01','to','2024-03-01',WT)).toBe('conflict');            // delisting on valid_from
+  expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF)).toBe('written');
+  expect(await setWin(a,t,'2001-08-27','from','2001-08-27',WF)).toBe('duplicate');
+  expect(await setWin(a,t,'2001-08-27','from','2000-01-01',WF)).toBe('conflict');          // already listing_date at another date
+  expect(await setWin(a,t,'2001-08-27','to','2026-06-30',WT)).toBe('written');
+  expect(await setWin(a,t,'2001-08-27','to','2026-06-30',WT)).toBe('duplicate');
+  expect(await setWin(a,t,'2001-08-27','to','2026-07-01',WT)).toBe('conflict');            // already closed
+  expect(await winState(t)).toEqual({valid_from:'2001-08-27',valid_to:'2026-06-30',valid_from_method:'listing_date',valid_to_method:'delisting',provenance:{exchange:'SSE',...WF,...WT}});
+  const c=await ticker();
+  await sec(a,c,'2024-03-01','2025-01-01',{valid_to_method:'unrecorded'});
+  expect(await setWin(a,c,'2024-03-01','from','2025-01-01',WF)).toBe('conflict');          // new from would not precede valid_to
+  await q(`update public.issuer_securities set valid_from_method='ticker_change' where ticker=$1`,[c]);
+  expect(await setWin(a,c,'2024-03-01','from','2020-01-01',WF)).toBe('conflict');          // method not first_observed/curated
+  expect(await setWin(a,await ticker(),'2024-03-01','from','2001-08-27',WF)).toBe('not_found');
+  expect(await setWin(randomUUID(),t,'2001-08-27','to','2026-06-30',WT)).toBe('not_found');
+  for(const bad of [()=>setWin(a,t,'2001-08-27','from','2000-01-01',WT),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{...WF,...WT}),()=>setWin(a,t,'2001-08-27','x','2000-01-01',WF),
+   ()=>setWin(a,t,'2001-08-27','from','2000-01-01',{valid_from:{url:'https://a.example/p?token=1'}}),()=>setWin(a,t,'2001-08-27','from','2000-01-01',{isin:{}})])
+   expect(await fails(bad())).toMatchObject({message:'invalid_window_write',code:'22023'});
+ });
+ it('a window write interleaved with an ISIN identifier write on the same row: ISIN first keeps both provenance keys; window first moves the key so the ISIN write finds no row',async()=>{
+  const setIsin=(a:string,t:string,from:string,isin:string,on:Pool|PoolClient=admin)=>
+   on.query(`select public.set_security_identifier($1,$2,$3::date,'isin',$4,$5::jsonb) v`,[a,t,from,isin,JSON.stringify(PI)]).then(r=>r.rows[0].v as string);
+  for(const isinFirst of [true,false]){
+   const a=await issuer();const t=await ticker();
+   await sec(a,t,'2024-03-01',null,{provenance:JSON.stringify({exchange:'SSE'})});
+   const isin=randomIsin();
+   await inTx(admin,async tx=>{
+    if(isinFirst)expect(await setIsin(a,t,'2024-03-01',isin,tx.c)).toBe('written');
+    else expect(await setWin(a,t,'2024-03-01','from','2001-08-27',WF,tx.c)).toBe('written');
+    const second=isinFirst?setWin(a,t,'2024-03-01','from','2001-08-27',WF):setIsin(a,t,'2024-03-01',isin);
+    await stillBlockedBehind(admin,tx.pid,second);
+    await tx.commit();
+    expect(await second).toBe(isinFirst?'written':'not_found');
+   });
+   expect(await winState(t)).toMatchObject({valid_from:'2001-08-27',valid_from_method:'listing_date',provenance:isinFirst?{exchange:'SSE',...PI,...WF}:{exchange:'SSE',...WF}});
+   expect((await secState(t)).isin).toBe(isinFirst?isin:null);
+  }
+ });
+ it('set_security_window surfaces an overlap as the exclusion violation 23P01',async()=>{
+  const a=await issuer();const t=await ticker();
+  await sec(a,t,'2010-01-01','2015-01-01',{valid_to_method:'unrecorded'});
+  await sec(a,t,'2015-01-01',null);
+  const err=await fails(setWin(a,t,'2015-01-01','from','2012-01-01',WF));
+  expect(['23P01','23505']).toContain(err.code);
+  expect((await q(`select to_char(valid_from,'YYYY-MM-DD') f from public.issuer_securities where ticker=$1 order by valid_from`,[t])).map(r=>r.f)).toEqual(['2010-01-01','2015-01-01']);
+ });
  // Task 4b review P1: the orgId write and its provenance key land in one locked UPDATE.
  const setOrg=(issuerId:string,value:string,prov:unknown,on:Pool|PoolClient=admin,col='cninfo_org_id')=>
   on.query(`select public.set_issuer_identifier($1,$2,$3,$4::jsonb) v`,[issuerId,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
supabase/migrations.lock.json:14:      "sha256": "e3922d6db5cab175a441382bb4019169ef6a467a691f278e00a17c4b018100d6"
supabase/migrations.lock.json:54:      "sha256": "9f51beed1a74e5f8a0644f149302ca0ee3c0490f0bab28d6abf86e4c1d6adcfd"
supabase/migrations.lock.json:78:      "sha256": "7a72c0d5bc15a7c4b3b24c8c78c6adcf7e2d7978c96509103e32a797dbd4e2bf"
docs/reports/2026-07-19-production-stability-remediation.md:54:- 浏览器 E2E：真实 Supabase 鉴权环境的公开页、登录页和未登录跳转 10/10 通过；无鉴权 mock 环境的 OAuth 展示、50 股票分片、`002463` 桌面和移动搜索 4/4 通过。
docs/product/10_TASK_BREAKDOWN.md:70:| E2 | 财务 5 年趋势图 | ⬜ | `financial_history` 渲染 5 年营收/净利/ROE |
docs/HANDOFF-2026-07-01.md:39:   - Unit-test the converters; E2E-verify only once a valid key exists.
src/lib/entities/link-research.test.ts:35:const LEI='3003003LS77D1DRDDE25',USCI='913300002539329145';
src/lib/entities/coverage.ts:3:// US in-scope issuers (fact_sync_scope market 'US', priority > 0); E2 (Task 5a) = listing-date
src/lib/entities/coverage.ts:28:export interface E2Result{backfillable:Ratio;not_backfillable:number;open_quarantine:number;passes:boolean}
src/lib/entities/coverage.ts:30: * E2 (spec §1.1): research-queue A/H rows. Backfillable = the earliest row of its ticker in this
src/lib/entities/coverage.ts:31: * database, stocks_universe.list_date non-null, and no open window_evidence_conflict /
src/lib/entities/coverage.ts:34:export function coverageE2(input:{rows:readonly Row[];listDates:ReadonlyMap<string,string|null>;queueIssuers:ReadonlySet<string>;openQuarantineKeys:ReadonlySet<string>}):E2Result{
src/lib/entities/backfill-windows.test.ts:66:  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,table_name:'issuer_securities',natural_key:'000001.SZ:1980-01-01',reason_code:'window_evidence_conflict',status:'open'})]);
src/lib/entities/identifiers/plan.test.ts:48:  const two=okR(AAPL_JOB,[rec({figi:'BBG000VENUE1',compositeFIGI:null}),rec({figi:'BBG000VENUE2',compositeFIGI:null})]);
src/lib/entities/identifiers/plan.test.ts:51:  const candidates=[{figi:'BBG000VENUE1',level:'venue'},{figi:'BBG000VENUE2',level:'venue'}];
src/lib/entities/identifiers/plan.test.ts:52:  expect(p.claims.map(c=>[c.op,c.id_type,c.value,c.detail.params])).toEqual([['set_identifier','figi','BBG000VENUE1',{candidates}],['set_identifier','figi','BBG000VENUE2',{candidates}]]);
src/lib/entities/identifiers/plan.test.ts:53:  expect(p.claims[0].detail.evidence.note).toBe('one of 2 candidate FIGIs: BBG000VENUE1(venue), BBG000VENUE2(venue)');
src/lib/entities/identifiers/openfigi.test.ts:17:const VENUES:FigiRecord[]=[eq({figi:'BBG000VENUE1',compositeFIGI:null,ticker:'ZZX'}),eq({figi:'BBG000VENUE2',compositeFIGI:null,ticker:'ZZX'})];
src/lib/entities/identifiers/openfigi.test.ts:71:   {figi:'BBG000VENUE2',level:'venue',exchCodes:['US'],securityType:'Common Stock'},
docs/audits/2026-11-04-company-research/01-codex-round1.md:32:| 28 | P2 should fix before plan | §§12.1, 12.3 | **The i18n implementation checklist is incomplete and its E2E assumption is wrong.** Adding JSON files and extending the `Domain` type does not load or test them. Protected `/en/...` paths redirect to unprefixed paths. | Runtime domains are enumerated in `src/i18n/request.ts:10–20`; the parity test separately hard-codes its loop at `src/i18n/messages-parity.test.ts:28–30`. Protected locale redirects are explicit in `src/middleware.ts:63–68`. | Register both domains in the runtime loader and parity loop, test placeholders, and switch protected-page language through the existing cookie/settings mechanism. |
docs/audits/2026-11-04-company-research/01-codex-round1.md:33:| 29 | P2 should fix before plan | §§12–14, 16 | **Acceptance tests do not cover the central failure modes, and some assertions are not established by the fixtures.** “Latest disclosureSeq=2,” eight columns, exact revision counts, and AAPL seed completeness need fixture evidence. E2E can be downgraded to a manual checklist despite being a phase exit condition. | The proposed `S4_TEST_STATE` registration is correct, but passing that inventory does not prove digest atomicity, complete reads, replay safety, or tenant-safe counts. The actual CI rule rejects missing/empty/skipped critical suites (`scripts/ci/research-checks.ts:43–60`). | Pin fixture manifests and expected values. Add truncation, stale-writer, tied-watermark, sweep-resume, acceptance, remapping, read-ack race, DCF dimensional, and provenance tests. Resolve CI feasibility before declaring C1 exit criteria. |
src/lib/entities/coverage.test.ts:3:import {coverageE1,coverageE2,meetsThreshold,ratio} from './coverage';
src/lib/entities/coverage.test.ts:33:describe('coverageE2',()=>{
src/lib/entities/coverage.test.ts:45:  const r=coverageE2({rows,listDates,queueIssuers:new Set(['q']),openQuarantineKeys:new Set(['00700.HK:2024-01-01'])});
src/lib/entities/windows.ts:2:// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
src/lib/entities/windows.ts:7:// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
src/lib/entities/windows.ts:80: const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
src/lib/entities/windows.ts:102: for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
docs/handoffs/alpha-s6/fixtures/golden-input-v2.json:4762:      "raw_sha256": "952d92e108f469a443022316095d2916e1dbad8cf22e08c122c3e140a58c7041",
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:14:| 10 | N10 | PARTIAL | §4.3.2 handles equality and both SQLSTATEs; its earliest-window restriction still conflicts with E2’s denominator and cannot prove that today’s listing date belongs to that historical owner. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:33:| 29 | N29 | PARTIAL | §1.1 adds measurement artifacts and §5.3 handles 20-F sampling; E1/E2 denominators and several work-package exit conditions remain inconsistent. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:70:| M26 | P2 | §§1.1 E1/E2, 4.3.2, 10 | **Coverage gates disagree with their writers and exit conditions.** E2 includes later ownership windows that §4.3.2 deliberately never upgrades. E1’s abbreviated denominator does not specify the LEI filter for ISIN. F3-1 can exit with merely reported numbers although E1 declares minimum thresholds. The 600519 acceptance example promises an ISIN despite the explicit no-proxy policy and unverified coverage. | Publish exact separate denominator queries and explicit unmet-gate handling. Restrict window coverage to evidenced eligible rows and make identifier examples conditional on obtained evidence. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:71:| M27 | P2 | §§3.1, 4.3.2, 5.4, 13 | **Replayability and privacy are only partially specified.** Window attribution lacks immutable source bytes. Gold PDFs have URLs/hashes but are absent from the bucket inventory, whose MIME allowlist excludes PDF. Bucket immutability, upload-failure behavior, and read/write role tests are not specified. The CN sample exports tenant-derived scope without naming the authorized user; omitting selection reasons does not remove membership information. | Retain replayable source snapshots, define immutable storage and failure semantics, and test bucket policies plus sanitized receipts/logs. Use a public sample or explicitly authorized user-scoped export. |
docs/audits/2026-11-04-data-foundation-3/04-codex-round3.md:31:| M27 | RESOLVED | §§3.1, 4.3.2, 5.4, 13 add retained evidence, copied window inputs, PDF storage, upload-failure handling, role tests, and an explicit export-authorization decision. |
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:21:| N10 listing-date gate unmeetable | ACCEPT | §4.3.2 equality upgrades method; earliest-window rule; both SQLSTATEs; E2 denominator = backfillable rows. |
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:77:| M26 coverage gates vs writers | ACCEPT | E1 exact queries, E2 restricted to backfillable rows, owner decision I for shortfall, 600519 example made conditional. |
docs/audits/2026-11-04-data-foundation-3/01-codex-round1.md:14:| N8 | P2 | §§3.1, 4.1.1–4.1.4, 4.3.2 | **Provenance cannot replay identifier and window decisions.** FIGI attribution records neither input `idValue` nor response hash; OpenFIGI responses are absent from the bucket inventory. GLEIF provenance references the full-file hash while only a separately hashed subset is retained. Window attribution points to mutable `stocks_universe`, not its source snapshot. Matching existing identifiers never gain missing provenance because only null values are updated. | Persist sanitized request/response evidence and exact row locators; link full-file metadata to retained-subset hashes. Reference immutable security snapshots. Allow evidence enrichment for equal values without overwriting values or prior evidence. |
docs/audits/2026-11-04-data-foundation-3/01-codex-round1.md:16:| N10 | P2 | §§1.1, 4.3.2 | **The listing-date algorithm cannot meet its 100% gate and can misdate ownership.** Equality (`list_date = valid_from`) never upgrades the method. Earlier curated dates are quarantined rather than reconciled, contradicting the unconditional exit criterion. Applying a security’s original listing date to every later ownership window is not valid for transferred/reused tickers. PK/unique collisions may also produce `23505`, not just `23P01`. | Distinguish listing history from issuer ownership. Specify equality, reviewed corrections, transferred windows, both SQLSTATEs, and an exceptions-aware coverage denominator. |
docs/superpowers/specs/2026-07-03-g1-i18n-design.md:27:- 测试：locale 解析链 TDD；E2E 新增 `/en` 落地 200+英文断言、`/`（zh）不回归；252 基线不回归。
docs/superpowers/specs/2026-07-03-g1-i18n-design.md:28:- 风险：middleware 组合次序（intl 先 auth 后）需 E2E 锁定登录跳转不被 locale 前缀污染（`/en/login?next=…` 场景）。
src/lib/facts/providers/cninfo-link.test.ts:64:  expect(body).toContain('seDate=2025-03-31%7E2025-04-06');expect(body).toContain('stock=600519%2C9900000227');expect(body).toContain('column=sse');
src/lib/facts/providers/cninfo-link.test.ts:99:   expect(p.http_status).toBe(200);expect(p.request_body).toContain('seDate=2025-03-31%7E2025-04-06');
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:373:1f679ac feat(entities): evidenced listing/delisting window backfill via atomic set_security_window, conflicts quarantined; E2 coverage segment
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:404:    feat(entities): evidenced listing/delisting window backfill via atomic set_security_window, conflicts quarantined; E2 coverage segment
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:415:+ * Evidenced holding windows (spec §4.3.2): earliest row per ticker → stocks_universe.list_date,
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:487:+ * windows (E2): research-queue A/H rows — backfillable rows at listing_date (target 100%), with the
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:497:+import {coverageE1,coverageE2,type E1Result,type E2Result} from '../../src/lib/entities/coverage';
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:542:+ const keys=new Set(open.filter(q=>q.reason_code==='window_evidence_conflict'||q.reason_code==='ownership_conflict').map(q=>String(q.natural_key)));
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:543:+ return coverageE2({rows,listDates,queueIssuers:queue,openQuarantineKeys:keys});
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:545:+const md=(at:string,a:E1Result|null,b:E2Result|null)=>[
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:550:+ ...(b?['## E2 · 持有区间（研究队列 A/H 行）','','| 指标 | 值 |','|---|---|',
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:552:+  `| 不可回填行 | ${b.not_backfillable} |`,`| open 隔离项（window_evidence_conflict / ownership_conflict） | ${b.open_quarantine} |`,'']:[]),
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:615:+export interface E2Result{backfillable:Ratio;not_backfillable:number;open_quarantine:number;passes:boolean}
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:617:+ * E2 (spec §1.1): research-queue A/H rows. Backfillable = the earliest row of its ticker in this
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:618:+ * database, stocks_universe.list_date non-null, and no open window_evidence_conflict /
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:621:+export function coverageE2(input:{rows:readonly Row[];listDates:ReadonlyMap<string,string|null>;queueIssuers:ReadonlySet<string>;openQuarantineKeys:ReadonlySet<string>}):E2Result{
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:637:+// Evidenced holding windows (spec §4.3.1–§4.3.2). planWindowBackfill is pure: per ticker it lifts
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:642:+// the first observation, or a delisting on/before valid_from, is a window_evidence_conflict
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:715:+ const park=(r:WindowRow,reason:'ownership_conflict'|'window_evidence_conflict',detail:Record<string,unknown>)=>parkConflict(tables,{
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:737:+ for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md:801:/bin/zsh -lc "cat ../../../AGENTS.md; find . -name CLAUDE.md -o -name AGENTS.md -o -name AGENTS.override.md; git show 1f679ac -- src/lib/entities/backfill-windows.test.ts src/lib/entities/coverage.test.ts src/lib/entities/identifiers.integration.test.ts; rg -n '4.3.2|E2|window_evidence_conflict|valid_from.*references|references.*issuer_securities' docs src supabase | head -65" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
docs/superpowers/specs/2026-07-02-osbornalpha-v3-refactor-design.md:170:- E2E 冒烟（Playwright）：录决策→录成交→看持仓→晨间复盘 主链路，每板块上线前跑
docs/superpowers/specs/2026-07-02-osbornalpha-v3-refactor-design.md:181:| P6 清尾 | 旧路由 301、V1 主题删除、全站 E2E |
src/lib/facts/sync-us.integration.test.ts:84:  // references it; ON CONFLICT DO NOTHING does not cover a missing parent) → issuers → issuer_securities.
docs/superpowers/specs/2026-11-04-industry-research-design.md:36:- 三条路由 E2E 通过；`industries` 域对等测试通过；DESIGN.md 审查通过；断网运行任一同步：批次 `failed`，旧数据不变，连续两次后新鲜度 `error`，页面显示旧 run + 徽标。

exec
/bin/zsh -lc "rg -n '4.3.2|回填|delist_date' docs/superpowers/specs/2026-11-04-data-foundation-3* | head -35; rg -n 'function parkConflict|function isUnique' src/lib/entities/{load-sec,claims}.ts; sed -n '1,100p' src/lib/db/table-client.ts; rg -n 'research_entity_keys|in_scope' supabase/migrations/* | tail -18; rg -n 'valid_from_method|valid_to_method' supabase/migrations/20261107090000_identifiers_and_dq.sql | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
25:| E2 | 研究队列 A/H 证券行中**可回填行**（该 ticker 在本库最早的持有行，且 `stocks_universe.list_date` 非空，且无 open 的 `window_evidence_conflict`/`ownership_conflict` 隔离项）`valid_from_method='listing_date'` 100%；不可回填行数与隔离项数单列 | 同脚本 `windows` 段，三个计数 |
56:| 上市日期 | `stocks_universe.list_date/delist_date/source/source_updated_at`：A 股 Tushare `stock_basic`、港股 `hk_basic`（上游交易所）；美股 Nasdaq 目录无上市日 | A/H 证据；值复制进 provenance |
70:两个迁移，可重放（**所有旧行回填只在新增列的那次执行**：用 `do $$ if not exists (select 1 from information_schema.columns …) then alter table … add column …; update …; end if $$` 包裹，重放不再触碰已写入的证据），补 `migrations.lock.json` 与 `database.types.ts`。第一个不依赖规格二；第二个在规格二迁移之后。`test:migrations` 在有数据的库上演练两次：第一次升级（含已关闭证券行、无 `resolved_at` 的已处理声明），写入新证据后第二次重放，断言证据未被改写。
83:首次加列时回填：`source='curated'` → `valid_from_method='curated'`；`valid_to is not null` → `valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end`。`provenance` 允许键（写入端 `sanitizeProvenance` 白名单，集成测试断言含私密键/URL token/用户 ID 的对象被拒）：`isin:{source, as_of, evidence_sha256, locator}`、`figi:{source, as_of, evidence_sha256, job:{idType, idValue, exchCode?}, level}`、`valid_from:{source, provider, as_of, row:{list_date, source, source_updated_at}}`（复制所用源行值，不引用可变表）、`valid_to:{…, row:{delist_date,…}}`、`pending_change:{first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers, sources}`。
238:**`financial_metrics`**：`based_on_lineage jsonb not null default '[]'`；首次加列时 `update financial_metrics set based_on_lineage = jsonb_build_array(jsonb_build_object('issuer_id', issuer_id, 'state_rev', based_on_rev))`；约束 `jsonb_array_length(based_on_lineage) >= 1`（加约束前回填）。规格二的 `replace_financial_metrics(uuid,text,bigint,jsonb)` 保留为兼容包装：`select replace_financial_metrics_lineage(issuer, market, jsonb_build_array({issuer, based_on_rev}), rows)`，签名不变，`based_on_lineage` 因此总是一致。`MetricRow`、`metricFromTable`、三种 `FactsDb` 实现与分页指标读取的一致性检查都保留并比较**完整** `based_on_lineage` 向量（不只 `based_on_rev`）（T8）。
332:#### 4.3.2 回填 `scripts/entity-keys/backfill-windows.ts`（`DATASETS.entities.windows`）
335:- 可回填条件：`list_date` 非空；本行是该 ticker `valid_from` 最小的行；方法 ∈ {`first_observed`,`curated`}。
338:- `delist_date` 非空且行未关闭且本行是该 ticker 最晚的持有行 → `valid_to=delist_date, valid_to_method='delisting'`（provenance 同法）；`delist_date <= valid_from` → 隔离。
339:- 美股无 `list_date`：不回填。
558:| 回填：上市日晚于观测 / 退市早于上市 | 隔离 | `window_evidence_conflict` | partial |
559:| 回填：23P01/23505 | 隔离 | `ownership_conflict` | partial |
611:`identifiers.integration.test.ts`、`dq-extensions.integration.test.ts`（含 `S4_TEST_STATE`，登记 `criticalSuites`）：两迁移在有数据库上升级 + 写入新证据后重放不改写；`valid_from` 更新受互斥约束；`resolve_identifier_claim` 每个 op 的成功/冲突回滚/目标不一致拒绝/非活跃发行人拒绝/`legacy`/`amend_required`/并发 409；`dq_reconciliations` 两条 kind 约束；`dq_filing_expectations` 全部约束组合；`replace_filing_expectations` 原子替换；`issuer_filing_profiles` 复合主键；`issuer_filer_categories`；`dq_reconcile_cycles` 单运行周期唯一索引与 `drc_done_accounted`；`dq_calendar_passes` 单未完成遍；`dq_freshness` weekly；`filings.accepted_at` 只允许 null→值且无角色可直写；`set_filing_acceptance`；`apply_reconcile_result` 持锁、只动围栏发行人的 `ok` 行、结果行+项+隔离+`hook:pending` 同一事务、同键第二次调用 `reused:true`、`state_rev+1`、与并发 `publish_sync_run` 串行；`complete_reconcile_member` 从已接受结果行推导计数、缺键 → `member_incomplete`；**每个提升入口**（`promote_quarantined`、`resolve_facts_quarantine`、`restore_reconciled`）都遵守 `fact_promote_rows` 新谓词（T6）；`filings` 的 `document_ref/document_url/link_attempts` 列级 update 仍可用、`accepted_at` 不可直写（T11）；**`restore_reconciled`：通过 + 哈希相等 → 项关闭且行真正提升（R1 回归）**、哈希不等 → `not_passing`、被其他 open 项引用 → `skipped`；`read_filing_facts` 返回全部代含 `quarantined`（读取器本身不过滤，绑定在调用方过滤）；`adopt_candidate` 全部码（含 `batch_mismatch`、发行人/市场取自 filing）、`stale_evaluation`、事务内 `hook` 写入、管理运行字段；`resolve_lineage_conflict` 锁定完整谱系、锁下重查、`lineage_changed`、`unresolved` 回滚、`promote_quarantined` 附加条款生效；`read_facts_lineage` 单发行人三种模式与 `read_facts` 逐字段一致、双发行人抑制与 `conflicts`、anon 只见 `ok`；`replace_financial_metrics_lineage` 成员 rev / 集合变化 / `scope_missing`、包装函数一致、`based_on_lineage` 回填；**拓扑：`issuers_topology_guard` 在全新连接上拒绝直接 update、在同一事务内 `set_merge` 成功返回后仍拒绝直接 update（S1 两项测试）、函数异常路径后设置已恢复；`set_merge` A→B 后 B→C 成功且 A 改指 C（R3 回归）、`row_count` 断言、与物化交错 → `stale_computation`；`set_dissolved` 的 `has_referrers`**；游标：`failed` 且 `attempts<3` 可认领、`attempts=3` 终态（S4）；`drc_done_accounted` 对 NULL 计数拒绝（S5）；围栏：过期/易主的尝试调用 `apply_reconcile_result`/`complete_reconcile_member`/`fail_reconcile_member` 得 `fence_failed` 且无写入；租约丢失前已提交的键被接手者复用、计数不重复（T2）；绑定：激活代内多行同键 → `left_ambiguous`，仅旧代同键 → 不歧义、按激活代绑定，`adopt_candidate` 遇仅旧代同键不报 `duplicate`（T1）；`adopt_candidate` 从持久化 camelCase 候选映射、代取自锚定运行、`mapping_version` 无留存 → `replay_required`（T5）；日历遍：第二个工作者租不到遍、全部遍函数围栏、冻结成员不受范围变化影响、失败成员重试成功只置 `done` 一次、`finish_calendar_pass` 两种终态都写 `finished_at`、过期工作者不能改动新租约者的进度（T3）；`read_facts_lineage` 非 `ok` 行 `disclosure_seq` 为空且只在 `history` 时返回（T7）；RLS 与桶策略（anon/authenticated 不可读写新表与桶）。
633:| F3-2 持有区间与 `asOf` | `backfill-windows.ts`、`sec-submissions.ts`、`load-sec` 换码、`resolveIssuer(asOf)`、路由 | F3-0 | E2、E3；回填回执 | 3 |
src/lib/entities/load-sec.ts:98:export async function parkConflict(client:TableClient,input:QuarantineInput,counts:BatchCounts,errors:BatchError[],error:BatchError):Promise<void>{
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
supabase/migrations/20261105091000_issuers.sql:186:alter table public.research_entity_keys add column if not exists issuer_id uuid references public.issuers(issuer_id) on delete restrict;
supabase/migrations/20261105091000_issuers.sql:188:create index if not exists research_entity_keys_issuer_idx on public.research_entity_keys(issuer_id) where issuer_id is not null;
supabase/migrations/20260926010000_research_entity_keys.sql:9:create table if not exists public.research_entity_keys (
supabase/migrations/20260926010000_research_entity_keys.sql:20:  in_scope       boolean not null default false,
supabase/migrations/20260926010000_research_entity_keys.sql:28:create unique index if not exists research_entity_keys_lei_idx on public.research_entity_keys(user_id,lei) where lei is not null;
supabase/migrations/20260926010000_research_entity_keys.sql:29:create unique index if not exists research_entity_keys_usci_idx on public.research_entity_keys(user_id,usci) where usci is not null;
supabase/migrations/20260926010000_research_entity_keys.sql:30:create unique index if not exists research_entity_keys_cik_idx on public.research_entity_keys(user_id,cik) where cik is not null;
supabase/migrations/20260926010000_research_entity_keys.sql:53:  foreach t in array array['research_entity_keys','research_entity_securities'] loop
19:  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'issuer_securities' and column_name = 'valid_from_method') then
21:      add column valid_from_method text not null default 'first_observed',
22:      add column valid_to_method text;
25:    update public.issuer_securities set valid_from_method = 'curated' where source = 'curated';
26:    update public.issuer_securities set valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end where valid_to is not null;
30:  drop constraint if exists issuer_securities_valid_from_method_check,
31:  drop constraint if exists issuer_securities_valid_to_method_check,
33:  add constraint issuer_securities_valid_from_method_check check (valid_from_method in ('first_observed','listing_date','ticker_change','curated')),
34:  add constraint issuer_securities_valid_to_method_check check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded')),
35:  add constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null));
392:    if not public.claim_keys_within(pa, array['share_class','valid_from','valid_from_method','source','isin','note','ticker'])
395:       or coalesce(pa ->> 'valid_from_method', '') not in ('first_observed','listing_date','ticker_change','curated')
407:      if not public.claim_keys_within(pa, array['valid_to','valid_to_method','note'])
409:         or coalesce(pa ->> 'valid_to_method', '') not in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded') then return 'params'; end if;
413:      if not public.claim_keys_within(pa, array['new_valid_from','valid_from_method','note'])
415:         or coalesce(pa ->> 'valid_from_method', '') not in ('listing_date','ticker_change','curated') then return 'params'; end if;
539:      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
540:      values (c.issuer_id, v_ticker, nullif(pa ->> 'isin', ''), pa ->> 'share_class', false, (pa ->> 'valid_from')::date, null, pa ->> 'valid_from_method', null, pa ->> 'source', v_pw);
542:      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
545:      update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw

exec
/bin/zsh -lc "sed -n '332,342p' docs/superpowers/specs/2026-11-04-data-foundation-3*; sed -n '80,115p' src/lib/entities/load-sec.ts; nl -ba src/lib/entities/windows.ts | sed -n '30,72p'; nl -ba src/lib/entities/windows.ts | tail -13; cat package.json | grep -A12 '\"test\"'; head -12 src/lib/db/table-client.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
#### 4.3.2 回填 `scripts/entity-keys/backfill-windows.ts`（`DATASETS.entities.windows`）

对每个证券行 join `stocks_universe`（同 ticker）：
- 可回填条件：`list_date` 非空；本行是该 ticker `valid_from` 最小的行；方法 ∈ {`first_observed`,`curated`}。
  - `list_date <= valid_from` → `update … set valid_from=list_date, valid_from_method='listing_date', provenance=provenance||{valid_from:{source:'stocks_universe.list_date', provider:<source>, as_of, row:{list_date, source, source_updated_at}}} where issuer_id and ticker and valid_from=<旧>`（相等时只改方法与 provenance）。23P01/23505 → 隔离 `ownership_conflict`。
  - `list_date > valid_from` → 隔离 `window_evidence_conflict`，不改。
- `delist_date` 非空且行未关闭且本行是该 ticker 最晚的持有行 → `valid_to=delist_date, valid_to_method='delisting'`（provenance 同法）；`delist_date <= valid_from` → 隔离。
- 美股无 `list_date`：不回填。

#### 4.3.3 美股：SEC submissions `src/lib/entities/identifiers/sec-submissions.ts`

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
    30	 */
    31	export async function keysetAll(tables:TableClient,table:string,match:Row,range:RangeOptions,orderBy:string,keyCols:readonly string[]):Promise<Row[]>{
    32	 const seen=new Set<string>(),out:Row[]=[];
    33	 let cursor:string|null=null;
    34	 for(;;){
    35	  const gte={...range.gte,...(cursor===null?{}:{[orderBy]:cursor})};
    36	  const page=await tables.select(table,match,{...range,gte,orderBy,limit:MAX_PAGE});
    37	  for(const r of page){const k=keyCols.map(c=>String(r[c])).join('\u0000');if(!seen.has(k)){seen.add(k);out.push(r);}}
    38	  if(page.length<MAX_PAGE)return out;
    39	  const last=String(page[page.length-1][orderBy]);
    40	  if(last===cursor)throw new Error('keyset_tie_group_overflow');
    41	  cursor=last;
    42	 }
    43	}
    44	
    45	const byFrom=(a:WindowRow,b:WindowRow)=>a.valid_from<b.valid_from?-1:a.valid_from>b.valid_from?1:0;
    46	
    47	export function planWindowBackfill(rows:readonly WindowRow[],universe:ReadonlyMap<string,UniverseDates>,asOf:string):WindowPlan{
    48	 const byTicker=new Map<string,WindowRow[]>();
    49	 for(const r of rows){const l=byTicker.get(r.ticker)??[];l.push(r);byTicker.set(r.ticker,l);}
    50	 const plan:WindowPlan={changes:[],conflicts:[],unchanged:0,skipped:[]};
    51	 for(const ticker of [...byTicker.keys()].sort()){
    52	  const list=[...byTicker.get(ticker)!].sort(byFrom);
    53	  const u=universe.get(ticker);
    54	  if(!u){plan.skipped.push('not_in_universe');continue;}
    55	  const first=list[0],last=list[list.length-1];
    56	  let firstFrom=first.valid_from;
    57	  if(u.list_date===null)plan.skipped.push('no_list_date');
    58	  else if(first.valid_from_method==='listing_date')plan.unchanged++;
    59	  else if(first.valid_from_method!=='first_observed'&&first.valid_from_method!=='curated')plan.skipped.push(`method_${first.valid_from_method}`);
    60	  else if(u.list_date>first.valid_from)plan.conflicts.push({row:first,reason:'list_date_after_first_observed',detail:{list_date:u.list_date,valid_from:first.valid_from,source:u.source}});
    61	  else{
    62	   const provenance=sanitizeProvenance({valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}});
    63	   firstFrom=u.list_date;
    64	   plan.changes.push({kind:'from',row:first,newValidFrom:firstFrom,provenance});
    65	  }
    66	  if(u.delist_date!==null&&last.valid_to===null){
    67	   const vf=last===first?firstFrom:last.valid_from;
    68	   if(u.delist_date<=vf)plan.conflicts.push({row:last,reason:'delist_on_or_before_valid_from',detail:{delist_date:u.delist_date,valid_from:vf,source:u.source}});
    69	   else plan.changes.push({kind:'to',row:last,validFrom:vf,newValidTo:u.delist_date,provenance:sanitizeProvenance({valid_to:{source:'stocks_universe.delist_date',provider:u.source,as_of:asOf,row:{delist_date:u.delist_date,source:u.source,source_updated_at:u.source_updated_at}}})});
    70	  }
    71	 }
    72	 plan.skipped.sort();
    95	   counts.failed++;errors.push({code:'row_changed',key:keyOf(c.row),message:`${c.kind}:${String(out)}`});
    96	  }catch(e){
    97	   if(c.kind==='from')blocked.add(id);
    98	   if(isUnique(e)){await park(c.row,'ownership_conflict',{reason:'window_overlaps_other_row',change:c.kind,new_value:c.kind==='from'?c.newValidFrom:c.newValidTo});continue;}
    99	   counts.failed++;errors.push({code:'window_write_error',key:keyOf(c.row),message:errorMessage(e)});
   100	  }
   101	 }
   102	 for(const x of plan.conflicts)await park(x.row,'window_evidence_conflict',{reason:x.reason,...x.detail});
   103	 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed;
   104	 const skippedSummary:Record<string,number>={};
   105	 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
   106	 return {counts,errors:withSkippedSummary(errors,skippedSummary),skippedSummary,rejectedSummary:{}};
   107	}
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

codex
The patch can orphan quarantine references after changing row keys, truncate paginated inputs under lower server limits, and misclassify successful partial backfills as freshness failures.

Full review comments:

- [P2] Quarantine conflicts under the row's updated natural key — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:102-102
  For a single row whose listing date is backfillable but whose delisting date precedes that listing date, the preceding loop changes `valid_from` before this conflict is parked. `x.row` still contains the original date, so the quarantine references a nonexistent natural key. `coverageE2` consequently misses the open conflict and can report 100% coverage with zero quarantined rows. Track successful key changes when parking conflicts, or prevent the conflicting row from being changed.

- [P2] Continue pagination when the server caps responses below MAX_PAGE — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:38-38
  When PostgREST's configured `max_rows` is below `MAX_PAGE`, a short response does not indicate exhaustion. This early return silently truncates both the backfill input and the research-queue/security inputs used by coverage, potentially producing misleading success reports. Unlike the existing `selectAll` helper, this helper assumes the requested page size is honored; paginate until exhaustion while retaining tie-group handling.

- [P2] Include successful window updates in the freshness outcome — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/entity-keys/backfill-windows.ts:57-58
  When a run successfully backfills rows and also quarantines a conflict, its status is `partial` and successful writes are counted exclusively as `versioned`. However, `loaderOutcome` recognizes only `inserted + duplicates` as landed rows for partial runs, so this call records a failed freshness attempt despite successful updates and no failures. Include `versioned` in the outcome policy or use a window-specific policy so normal partial backfills do not incorrectly degrade dataset freshness.
The patch can orphan quarantine references after changing row keys, truncate paginated inputs under lower server limits, and misclassify successful partial backfills as freshness failures.

Full review comments:

- [P2] Quarantine conflicts under the row's updated natural key — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:102-102
  For a single row whose listing date is backfillable but whose delisting date precedes that listing date, the preceding loop changes `valid_from` before this conflict is parked. `x.row` still contains the original date, so the quarantine references a nonexistent natural key. `coverageE2` consequently misses the open conflict and can report 100% coverage with zero quarantined rows. Track successful key changes when parking conflicts, or prevent the conflicting row from being changed.

- [P2] Continue pagination when the server caps responses below MAX_PAGE — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/windows.ts:38-38
  When PostgREST's configured `max_rows` is below `MAX_PAGE`, a short response does not indicate exhaustion. This early return silently truncates both the backfill input and the research-queue/security inputs used by coverage, potentially producing misleading success reports. Unlike the existing `selectAll` helper, this helper assumes the requested page size is honored; paginate until exhaustion while retaining tie-group handling.

- [P2] Include successful window updates in the freshness outcome — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/entity-keys/backfill-windows.ts:57-58
  When a run successfully backfills rows and also quarantines a conflict, its status is `partial` and successful writes are counted exclusively as `versioned`. However, `loaderOutcome` recognizes only `inserted + duplicates` as landed rows for partial runs, so this call records a failed freshness attempt despite successful updates and no failures. Include `versioned` in the outcome policy or use a window-specific policy so normal partial backfills do not incorrectly degrade dataset freshness.

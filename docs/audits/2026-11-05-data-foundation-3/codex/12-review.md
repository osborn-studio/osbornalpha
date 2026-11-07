OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0ab-ed8a-7d23-b7c0-0bace995dc0b
--------
user
commit 997bd69
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 997bd69; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1918ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-q3yIlqJv' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Q9En8vZo' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3htvdBGE' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mVF0mClt' (errno=Operation not permitted)
997bd69 feat(facts): SEC acceptance times — provider, enrich-acceptance script with E7 report, sync step 9b (F3-4)
 scripts/facts/enrich-acceptance.ts             | 100 ++++++++++++++++++++++
 src/lib/facts/deps.test.ts                     |   2 +-
 src/lib/facts/deps.ts                          |  11 ++-
 src/lib/facts/providers/sec-acceptance.test.ts | 113 +++++++++++++++++++++++++
 src/lib/facts/providers/sec-acceptance.ts      | 112 ++++++++++++++++++++++++
 src/lib/facts/sync.test.ts                     |  26 ++++++
 src/lib/facts/sync.ts                          |   8 ++
 7 files changed, 369 insertions(+), 3 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do [ ! -f "$p" ] || cat "$p"; done; git show 997bd69' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-cU9y02hs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2oSO8clG' (errno=Operation not permitted)
commit 997bd69a85da53f9c5b98ddf77aefd816444a41c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:43:22 2026 -0800

    feat(facts): SEC acceptance times — provider, enrich-acceptance script with E7 report, sync step 9b (F3-4)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/facts/enrich-acceptance.ts b/scripts/facts/enrich-acceptance.ts
new file mode 100644
index 0000000..134ea59
--- /dev/null
+++ b/scripts/facts/enrich-acceptance.ts
@@ -0,0 +1,100 @@
+/**
+ * SEC acceptance times for edgar filings (plan 3 spec §4.5, E7).
+ *
+ *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--apply]
+ *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts --report
+ *
+ * Without --issuer: every US fact_sync_scope row with priority > 0 (fetch_key = 10-digit CIK);
+ * --issuer tickers are resolved by today's ownership (unknown or no CIK → exit 2).
+ * Dry run (default): fetches submissions (raw bytes kept in memory), reports what would be written;
+ * no batch, no database write. --apply: one ingest batch (producer enrich-acceptance, dataset
+ * DATASETS.acceptance, triggered_by script, code version required), set_filing_acceptance per
+ * filing, raw submissions into the reconcile-raw bucket, freshness recorded (daily).
+ * --report (alone): the E7 measure — edgar filings of in-scope US issuers with accepted_at / all —
+ * as one JSON line (target ≥ 0.99; a miss is reported as the real number, never padded).
+ * sec.filing_date_vs_submissions results are listed per issuer; they are written once plan-3
+ * Part D wires recordDateMismatch (record.ts) into the enrichAcceptance call below.
+ * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
+ */
+import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
+import type {BatchCounts,BatchError} from '../../src/lib/dq/batches';
+import {DATASETS} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
+import {resolveIssuer} from '../../src/lib/entities/resolve';
+import {supabaseFactsDb} from '../../src/lib/facts/db';
+import {enrichAcceptance} from '../../src/lib/facts/providers/sec-acceptance';
+import type {AcceptanceDeps} from '../../src/lib/facts/providers/sec-acceptance';
+import {makeBudget,resolveCodeVersion} from '../../src/lib/facts/sync';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const USAGE='usage: enrich-acceptance.ts [--issuer <ticker>]... [--apply] | --report';
+const E7_TARGET=0.99;
+const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
+
+async function report():Promise<void>{
+ const tables=supabaseTableClient(getAdminSupabase());
+ const scope=(await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(r=>Number(r.priority)>0);
+ let total=0,accepted=0;
+ for(const s of scope){
+  const issuer_id=String(s.issuer_id);
+  total+=await tables.count('filings',{issuer_id,market:'US',source:'edgar'});
+  accepted+=await tables.count('filings',{issuer_id,market:'US',source:'edgar'},{gte:{accepted_at:'1900-01-01T00:00:00Z'}});   // gte excludes null
+ }
+ const rate=total===0?null:accepted/total;
+ console.log(JSON.stringify({measure:'E7',issuers:scope.length,edgar_filings:total,with_accepted_at:accepted,rate,target:E7_TARGET,meets:rate!==null&&rate>=E7_TARGET}));
+}
+
+async function main():Promise<void>{
+ const argv=process.argv.slice(2);let apply=false,doReport=false;const tickers:string[]=[];
+ for(let i=0;i<argv.length;i++){
+  const x=argv[i],v=argv[i+1];
+  if(x==='--apply')apply=true;else if(x==='--report')doReport=true;else if(x==='--issuer'&&v){tickers.push(v);i++;}
+  else{console.error(USAGE);process.exit(2);}
+ }
+ if(doReport){if(apply||tickers.length>0){console.error(USAGE);process.exit(2);}await report();return;}
+ const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
+ const today=new Date().toISOString().slice(0,10);
+ let issuers:{issuerId:string;cik10:string;label:string}[]=[];
+ if(tickers.length===0){
+  issuers=(await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(r=>Number(r.priority)>0).map(r=>({issuerId:String(r.issuer_id),cik10:String(r.fetch_key),label:String(r.fetch_key)}));
+ }else for(const t of tickers){
+  const r=await resolveIssuer(tables,{ticker:t},{asOf:today});const cik=r?.identifiers.cik;
+  if(!r||!cik){console.error(`unknown ticker or no CIK: ${t}`);process.exit(2);}
+  issuers.push({issuerId:r.issuer_id,cik10:cik.padStart(10,'0'),label:t});
+ }
+ const raw=apply?supabaseRawStore(sb):memoryRawStore();
+ const writes:AcceptanceDeps['db']=apply?db:{filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:async()=>true};   // dry run: count, never write
+ let batchId:string|null=null;
+ if(apply){
+  const codeVersion=resolveCodeVersion();
+  if(!codeVersion){console.error('code version unavailable (VERCEL_GIT_COMMIT_SHA or a git checkout)');process.exit(1);}
+  batchId=(await startBatch(tables,{producer:'enrich-acceptance',dataset:DATASETS.acceptance,toolVersions:{source:'sec_submissions'},codeVersion,triggeredBy:'script'})).batchId;
+ }
+ const counts:BatchCounts=emptyCounts();const errors:BatchError[]=[];let mismatches=0,issuerFailures=0;
+ const budget=makeBudget(null);
+ for(const it of issuers){
+  try{
+   const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom})},{issuerId:it.issuerId,cik10:it.cik10},budget);
+   for(const k of Object.keys(counts) as (keyof BatchCounts)[])counts[k]+=out.counts[k];
+   errors.push(...out.errors);mismatches+=out.mismatches.length;
+   if(out.counts.failed>0||out.errors.some(e=>e.code!=='skipped_summary'))issuerFailures++;
+   console.log(JSON.stringify({issuer:it.issuerId,label:it.label,counts:out.counts,errors:out.errors.map(e=>e.code),date_mismatches:out.mismatches.map(m=>m.natural_key)}));
+  }catch(e){
+   issuerFailures++;errors.push({code:'unknown',key:it.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});
+   console.log(JSON.stringify({issuer:it.issuerId,label:it.label,error:e instanceof Error?e.message:String(e)}));
+  }
+  await pause(120);   // SEC fair access between issuers (sec-submissions.ts paces its own page requests, incl. the coverFrom pages)
+ }
+ let status='dry_run';
+ if(batchId!==null){
+  status=await finishBatch(tables,batchId,{counts,errors});
+  await recordAttempt(tables,DATASETS.acceptance,{ok:status==='success',cadence:'daily',detail:{issuers:issuers.length,...counts,date_mismatches:mismatches}});
+ }
+ console.log(JSON.stringify({status,issuers:issuers.length,counts,date_mismatches:mismatches}));
+ process.exit((batchId!==null&&(status==='failed'||status==='partial'))||(batchId===null&&issuerFailures>0)?1:0);
+}
+
+main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
diff --git a/src/lib/facts/deps.test.ts b/src/lib/facts/deps.test.ts
index 417d3a1..7fe76fc 100644
--- a/src/lib/facts/deps.test.ts
+++ b/src/lib/facts/deps.test.ts
@@ -90,7 +90,7 @@ describe('productionSyncDeps',()=>{
   process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='service-role-test-key';   // createClient never connects at construction
   try{
    const deps=productionSyncDeps({deadline:null,codeVersion:'c'.repeat(40)});
-   for(const k of ['fetchUs','fetchCn','parseUs','parseCn','linkCn','coverageCn','now'] as const)expect(typeof deps[k],k).toBe('function');
+   for(const k of ['fetchUs','fetchCn','parseUs','parseCn','linkCn','coverageCn','enrichAcceptance','now'] as const)expect(typeof deps[k],k).toBe('function');
    expect(deps.coverageCn).toBe(coverageSummary);
    const parsed=parseTushareStatements(loadTushareFixtures('600519.SH'),{sinceYear:2014});
    expect(deps.coverageCn!(parsed)).toEqual(coverageSummary(parsed));
diff --git a/src/lib/facts/deps.ts b/src/lib/facts/deps.ts
index 9d0ae3b..7151dd3 100644
--- a/src/lib/facts/deps.ts
+++ b/src/lib/facts/deps.ts
@@ -1,7 +1,7 @@
 // src/lib/facts/deps.ts
 // Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
-// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), and the cninfo
-// linker, which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass
+// Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), the cninfo
+// linker, and step 9b (SEC acceptance times through sec-submissions.ts), which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass
 // (it hands over the FilingRow only). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
 // only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion,
 // which this delegates to); null means "refuse to apply".
@@ -11,6 +11,9 @@ import type {TableClient} from '../db/table-client';
 import {isCurrentSecurity} from '../entities/resolve';
 import {supabaseFactsDb} from './db';
 import {supabaseSnapshotStore} from './snapshot-store';
+import {supabaseRawStore} from '../dq/raw-store';
+import {fetchSubmissions} from '../entities/identifiers/sec-submissions';
+import {enrichAcceptance} from './providers/sec-acceptance';
 import {fetchCompanyFacts,parseCompanyFacts} from './providers/edgar-companyfacts';
 import {coverageSummary,fetchTushareStatements,parseTushareStatements} from './providers/tushare-statements';
 import {linkCninfoFiling} from './providers/cninfo-link';
@@ -68,6 +71,10 @@ export function productionSyncDeps(opts:ProductionDepsOptions):SyncDeps{
   parseCn:(snapshots,o)=>parseTushareStatements(snapshots,{sinceYear:o.sinceYear}),
   coverageCn:coverageSummary,   // → coverage_summary in the batch receipt
   linkCn:cninfoLinker(tables,db),
+  // 9b: one submissions fetch per published US issuer, with the files[] pages back to the earliest pending
+  // filing (coverFrom, plan audit R3); raw bytes into reconcile-raw. sec.filing_date_vs_submissions
+  // results are recorded once plan-3 Part D adds recordDateMismatch (record.ts) here.
+  enrichAcceptance:(issuer,cik10,b)=>enrichAcceptance({db,submissions:(c,bb,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw:supabaseRawStore(sb),budget:bb},{coverFrom})},{issuerId:issuer,cik10},b),
   now:opts.now??(()=>new Date()),deadline:opts.deadline,codeVersion:opts.codeVersion,
  };
 }
diff --git a/src/lib/facts/providers/sec-acceptance.test.ts b/src/lib/facts/providers/sec-acceptance.test.ts
new file mode 100644
index 0000000..a7bfc5f
--- /dev/null
+++ b/src/lib/facts/providers/sec-acceptance.test.ts
@@ -0,0 +1,113 @@
+// src/lib/facts/providers/sec-acceptance.test.ts
+import {describe,expect,it,vi} from 'vitest';
+import {randomUUID} from 'node:crypto';
+import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
+import {filingInsert} from '../db-contract';
+import {memoryFactsDb} from '../memory-facts-db';
+import {FactsDbError} from '../types';
+import type {Budget} from '../types';
+import {acceptanceIndex,enrichAcceptance,parseAcceptanceDateTime} from './sec-acceptance';
+
+const budget:Budget={remainingMs:()=>60_000,signal:new AbortController().signal};
+type Entry=SubmissionFiling;
+const entry=(accessionNumber:string,filingDate:string,acceptanceDateTime:string|null,form='10-Q',page='recent'):Entry=>({accessionNumber,filingDate,reportDate:'2023-12-31',acceptanceDateTime,form,primaryDocument:'d.htm',isInlineXBRL:true,page});
+// Task 6a shape: SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:{…, filings}, complete}
+const PAGE1='CIK0000320193-submissions-001.json';
+const snapshot=(recent:Entry[],pages:{name:string;sha256:string}[]=[]):SubmissionsSnapshot=>({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'a'.repeat(64),path:`sec-submissions/${'a'.repeat(64)}.json`},
+ pages:pages.map(x=>({...x,path:`sec-submissions/${x.sha256}.json`})),parsed:{filings:recent},complete:true} as unknown as SubmissionsSnapshot);
+
+describe('parseAcceptanceDateTime',()=>{
+ it('accepts SEC UTC timestamps and refuses everything else (missing stays missing)',()=>{
+  expect(parseAcceptanceDateTime('2026-09-18T00:53:51.000Z')).toBe('2026-09-18T00:53:51.000Z');
+  expect(parseAcceptanceDateTime('2024-02-01T21:05:00Z')).toBe('2024-02-01T21:05:00.000Z');
+  for(const v of [null,'',' 2024-02-01T21:05:00Z','2024-02-01 21:05:00','2024-02-01T21:05:00+01:00','2024-02-30T10:00:00.000Z','20240201',42])expect(parseAcceptanceDateTime(v)).toBeNull();
+ });
+});
+
+describe('acceptanceIndex',()=>{
+ it('indexes by accessionNumber; a repeated accession with the same values is kept, a disagreeing one is ambiguous and left out',()=>{
+  const {index,ambiguous}=acceptanceIndex([entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('B','2024-03-01','2024-03-01T10:00:00.000Z'),entry('B','2024-03-02','2024-03-01T10:00:00.000Z'),entry('C','2024-04-01',null)]);
+  expect(index.get('A')).toEqual({accessionNumber:'A',filingDate:'2024-02-01',form:'10-Q',acceptedAt:'2024-02-01T21:05:00.000Z',page:'recent'});
+  expect(index.has('B')).toBe(false);expect(ambiguous).toEqual(['B']);
+  expect(index.get('C')!.acceptedAt).toBeNull();
+ });
+});
+
+async function seeded(){
+ const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
+ await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'0000320193'}]);await db.claimLease(iss,'US',b,600);
+ const run=await db.beginRun(iss,'US',b,1);
+ const f=(ref:string,availableDate:string)=>filingInsert(iss,{sourceRef:ref,availableDate});
+ const ok=f('0000320193-24-000001','2024-02-01'),mismatch=f('0000320193-24-000002','2024-05-02'),absent=f('0000320193-24-000003','2024-08-02'),noTime=f('0000320193-24-000004','2024-11-01');
+ await db.stageFilings(run,[ok,mismatch,absent,noTime]);await db.publishRun(run,[ok,mismatch,absent,noTime].map(x=>x.filing_id));
+ const snap=snapshot([entry(ok.sourceRef,'2024-02-01','2024-02-01T21:05:00.000Z'),entry(mismatch.sourceRef,'2024-05-01','2024-05-01T20:00:00.000Z'),entry(noTime.sourceRef,'2024-11-01',null)]);
+ return {db,iss,ok,mismatch,absent,noTime,snap};
+}
+
+describe('enrichAcceptance (spec §4.5)',()=>{
+ it('writes acceptance for matching filings; a filingDate ≠ available_date becomes a sec.filing_date_vs_submissions result and no write; unknown or time-less accessions are skipped_summary',async()=>{
+  const {db,iss,ok,mismatch,snap}=await seeded();
+  const record=vi.fn(async(_r:unknown)=>{});
+  const submissions=vi.fn(async(_c:string,_b:Budget,_coverFrom:string)=>snap);
+  const out=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(submissions).toHaveBeenCalledWith('0000320193',budget,'2024-01-25');   // coverFrom = earliest pending available_date − 7 days (plan audit R3)
+  expect(out.counts).toMatchObject({fetched:2,inserted:1,duplicates:0,failed:1});
+  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2})}]);
+  expect(record).toHaveBeenCalledTimes(1);
+  expect(record.mock.calls[0][0]).toEqual({natural_key:`320193:${mismatch.sourceRef}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
+   left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
+   detail:{left_text:'2024-05-02',right_text:'2024-05-01',left:{filing_id:mismatch.filing_id,source_ref:mismatch.sourceRef},right:{document:'submissions',sha256:'a'.repeat(64),locator:`filings.recent[accessionNumber=${mismatch.sourceRef}]`}}});
+  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
+  expect((await db.findFilingBySourceRef('edgar',mismatch.sourceRef))!.accepted_at).toBeNull();
+  // second pass: the accepted filing is no longer pending; the mismatch is reported again
+  const again=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(again.counts).toMatchObject({fetched:1,inserted:0,failed:1});
+  expect(submissions.mock.calls[1][2]).toBe('2024-04-25');                       // the accepted 2024-02-01 filing no longer widens the window
+ });
+ it('a pending accession listed only in a historical files[] page is fetched through coverFrom and written; a mismatch there cites that page and its hash (plan audit R3)',async()=>{
+  const {db,iss,absent,noTime}=await seeded();
+  const histSha='e'.repeat(64);
+  const withPage=snapshot([entry(noTime.sourceRef,'2024-11-01',null)],[{name:PAGE1,sha256:histSha}]);
+  (withPage.parsed.filings as Entry[]).push(entry(absent.sourceRef,'2024-08-02','2024-08-02T20:30:00.000Z','10-Q',PAGE1));
+  const mainOnly=snapshot([entry(noTime.sourceRef,'2024-11-01',null)]);
+  // the stub answers like fetchSubmissions: the historical page is included only when coverFrom reaches it
+  const submissions=vi.fn(async(_c:string,_b:Budget,coverFrom:string)=>coverFrom<='2024-08-02'?withPage:mainOnly);
+  const out=await enrichAcceptance({db,submissions,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(submissions.mock.calls[0][2]<='2024-08-02').toBe(true);
+  expect((await db.findFilingBySourceRef('edgar',absent.sourceRef))!.accepted_at).toBe('2024-08-02T20:30:00.000Z');
+  expect(out.counts).toMatchObject({inserted:1});
+  // filingDate disagreeing on the historical page: the result points at PAGE1 and its sha256, not the main document
+  const {db:db2,iss:iss2,absent:absent2}=await seeded();
+  const moved=snapshot([],[{name:PAGE1,sha256:histSha}]);
+  (moved.parsed.filings as Entry[]).push(entry(absent2.sourceRef,'2024-08-01','2024-08-01T20:30:00.000Z','10-Q',PAGE1));
+  const record=vi.fn(async(_r:unknown)=>{});
+  await enrichAcceptance({db:db2,submissions:async()=>moved,recordDateMismatch:record},{issuerId:iss2,cik10:'0000320193'},budget);
+  expect(record.mock.calls[0][0]).toMatchObject({detail:{right:{document:PAGE1,sha256:histSha,locator:`${PAGE1}[accessionNumber=${absent2.sourceRef}]`}}});
+ });
+ it('without a recorder the mismatches are returned and the receipt says they were not recorded',async()=>{
+  const {db,iss,snap}=await seeded();
+  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(out.mismatches).toHaveLength(1);
+  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,filing_date_mismatch_unrecorded:1})}]);
+ });
+ it('acceptance_conflict counts as failed with its own error; the same value again is a duplicate; other errors are thrown',async()=>{
+  const {db,iss,ok,snap}=await seeded();
+  const conflicting={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new FactsDbError('acceptance_conflict');})};
+  const out=await enrichAcceptance({db:conflicting,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(out.counts).toMatchObject({fetched:2,inserted:0,failed:2});
+  expect(out.errors).toContainEqual({code:'acceptance_conflict',key:ok.sourceRef});
+  const dup={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>false)};
+  expect((await enrichAcceptance({db:dup,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).counts).toMatchObject({duplicates:1});
+  const broken={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new Error('db down');})};
+  await expect(enrichAcceptance({db:broken,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).rejects.toThrow('db down');
+ });
+ it('submissions unavailable → sec_unavailable, nothing written; no pending filing → no fetch at all',async()=>{
+  const {db,iss}=await seeded();
+  const out=await enrichAcceptance({db,submissions:async()=>{throw new Error('404');}},{issuerId:iss,cik10:'0000320193'},budget);
+  expect(out.counts).toMatchObject({fetched:0,inserted:0,failed:0});
+  expect(out.errors).toEqual([{code:'sec_unavailable',key:iss,message:'404'}]);
+  const none=vi.fn();
+  expect((await enrichAcceptance({db,submissions:none},{issuerId:randomUUID(),cik10:'0000000001'},budget)).counts.fetched).toBe(0);
+  expect(none).not.toHaveBeenCalled();
+ });
+});
diff --git a/src/lib/facts/providers/sec-acceptance.ts b/src/lib/facts/providers/sec-acceptance.ts
new file mode 100644
index 0000000..2a06f0e
--- /dev/null
+++ b/src/lib/facts/providers/sec-acceptance.ts
@@ -0,0 +1,112 @@
+// src/lib/facts/providers/sec-acceptance.ts
+// SEC acceptance times (plan 3 spec §4.5; step 9b of the US facts sync; E7). One submissions
+// snapshot (sec-submissions.ts: `parsed.filings` = filings.recent plus any fetched files[] pages; the
+// main document's raw bytes are in the reconcile-raw bucket under main.sha256, each page's under its own
+// sha256) is indexed by accessionNumber. The snapshot is fetched with coverFrom = the earliest pending
+// available_date − 7 days (plan audit R3), so every files[] page that can hold a pending filing is fetched:
+// a filing listed only in a historical page is written, never left acceptance_not_found. Every edgar
+// filing of the issuer whose accepted_at is null:
+//  - in the snapshot with an acceptance time and filingDate = available_date →
+//    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
+//    false (same value already) → duplicates, acceptance_conflict → failed + error;
+//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
+//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
+//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
+//  - absent, ambiguous, or without a parseable acceptance time → skipped_summary
+//    (acceptance_not_found / acceptance_ambiguous); never a guessed time.
+// fetched counts the filings that reached a decision. A submissions failure → sec_unavailable.
+import {emptyCounts} from '../../dq/batches';
+import type {BatchCounts,BatchError} from '../../dq/batches';
+import type {ReconcileResultInput} from '../../dq/reconcile/types';
+import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
+import {FactsDbError} from '../types';
+import type {Budget,FactsDb,FilingRow} from '../types';
+
+export const ACCEPTANCE_SOURCE='sec_submissions' as const;
+export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
+/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
+export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
+/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
+export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
+export interface AcceptanceDeps{
+ db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
+ /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
+ submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
+ /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
+ recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
+}
+export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}
+
+const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
+/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
+export function parseAcceptanceDateTime(v:unknown):string|null{
+ if(typeof v!=='string'||!SEC_TS.test(v))return null;
+ const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
+ const iso=new Date(ms).toISOString();
+ return iso.slice(0,19)===v.slice(0,19)?iso:null;
+}
+/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
+export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
+ const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
+ for(const e of entries){
+  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
+  const seen=index.get(x.accessionNumber);
+  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
+  else if(!seen)index.set(x.accessionNumber,x);
+ }
+ for(const a of bad)index.delete(a);
+ return {index,ambiguous:[...bad].sort()};
+}
+/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
+export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
+ const min=pending.map(f=>f.available_date).sort()[0];
+ const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
+ return d.toISOString().slice(0,10);
+}
+/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
+export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
+/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
+export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
+ return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
+  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
+  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
+   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
+   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
+}
+
+export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget):Promise<AcceptanceOutcome>{
+ const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
+ const pending=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
+ if(pending.length===0)return out;
+ let snap:SubmissionsSnapshot;
+ try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
+ catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
+ out.snapshotSha256=snap.main.sha256;
+ const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
+ const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
+ let notFound=0,unrecorded=0;
+ for(const f of pending){
+  const e=index.get(f.source_ref);
+  if(!e||e.acceptedAt===null){notFound++;continue;}
+  out.counts.fetched++;
+  if(e.filingDate!==f.available_date){
+   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
+   if(deps.recordDateMismatch){
+    try{await deps.recordDateMismatch(r);}
+    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
+   }else unrecorded++;
+   continue;
+  }
+  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
+  catch(err){
+   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
+   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
+  }
+ }
+ const summary:Record<string,number>={};
+ if(notFound>0)summary.acceptance_not_found=notFound;
+ if(ambiguous.length>0)summary.acceptance_ambiguous=ambiguous.length;
+ if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
+ if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
+ return out;
+}
diff --git a/src/lib/facts/sync.test.ts b/src/lib/facts/sync.test.ts
index aeea985..c06492f 100644
--- a/src/lib/facts/sync.test.ts
+++ b/src/lib/facts/sync.test.ts
@@ -587,3 +587,29 @@ describe('runFactsSync — grouped parser evidence',()=>{
   expect((await db.filingsOfIssuer(ISSUER,'CN',{}))[0].link_attempts).toBe(0);          // never reaches MAX_LINK_ATTEMPTS
  });
 });
+describe('runFactsSync — step 9b acceptance (plan 3 §4.5)',()=>{
+ const outcome=(errors:{code:string;key?:string;message?:string}[])=>({issuerId:ISSUER,counts:{fetched:0,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:0},errors,mismatches:[],snapshotSha256:null});
+ it('runs after materialize for a published US issuer with the scope fetch key (10-digit CIK); its errors join the issuer receipt',async()=>{
+  const enrichAcceptance=vi.fn(async()=>outcome([{code:'skipped_summary',key:`${ISSUER}:acceptance`,message:'{"acceptance_not_found":1}'}]));
+  const {deps}=harness(FY23,{enrichAcceptance});
+  const r=await run(deps);
+  expect(enrichAcceptance).toHaveBeenCalledWith(ISSUER,'0000320193',expect.anything());
+  expect(mocks.materialize.mock.invocationCallOrder[0]).toBeLessThan(enrichAcceptance.mock.invocationCallOrder[0]);
+  expect(r.issuers[0].outcome).toBe('published');
+  expect(r.issuers[0].errors).toContainEqual({code:'skipped_summary',key:`${ISSUER}:acceptance`,message:'{"acceptance_not_found":1}'});
+  expect(r.status).toBe('success');
+ });
+ it('a failing acceptance step never fails the published issuer: acceptance_failed is recorded and the batch is partial',async()=>{
+  const {deps}=harness(FY23,{enrichAcceptance:async()=>{throw new Error('sec down');}});
+  const r=await run(deps);
+  expect(r.issuers[0].outcome).toBe('published');
+  expect(r.issuers[0].errors).toContainEqual({code:'acceptance_failed',key:ISSUER,message:'sec down'});
+  expect(r.status).toBe('partial');
+ });
+ it('is not called for CN',async()=>{
+  const enrichAcceptance=vi.fn(async()=>outcome([]));
+  const {deps}=harness(parsed([cnFiling()],[cnRevenue()]),{enrichAcceptance},CN_SCOPE);
+  await run(deps,{market:'CN'});
+  expect(enrichAcceptance).not.toHaveBeenCalled();
+ });
+});
diff --git a/src/lib/facts/sync.ts b/src/lib/facts/sync.ts
index 9941be4..0b4b9f7 100644
--- a/src/lib/facts/sync.ts
+++ b/src/lib/facts/sync.ts
@@ -26,6 +26,7 @@ import type {SnapshotStore} from './snapshot-store';
 import {reconcileScope,scopeRowFor} from './scope';
 import type {ScopeInputRow} from './scope';
 import {FORMULA_VERSION,materialize} from './derive';
+import type {AcceptanceOutcome} from './providers/sec-acceptance';
 
 /** Shape of providers/tushare-statements.ts::coverageSummary entries (the adapter is injected, never imported here). */
 export interface CoverageEntry{api:string;report_type:number;years:Record<string,number>}
@@ -40,6 +41,8 @@ export interface SyncDeps{
  linkCn?:(filing:FilingRow,b:Budget)=>Promise<{document_ref:string;document_url:string}|'none'|'ambiguous'|'unlinkable'>;
  /** CN coverage summary (§6.3 coverage_summary), wired by deps.ts to coverageSummary (round-1 #12). */
  coverageCn?:(parsed:ParseResult)=>CoverageEntry[];
+ /** Step 9b (plan 3 §4.5): SEC acceptance times for a published US issuer, from the issuer's scope fetch key (10-digit CIK). Wired by deps.ts; its errors join the issuer receipt and never fail a published issuer. */
+ enrichAcceptance?:(issuer:string,cik10:string,b:Budget)=>Promise<AcceptanceOutcome>;
  now:()=>Date;deadline:Date|null;codeVersion:string|null;
 }
 /**
@@ -284,6 +287,11 @@ export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:
   await renewIfNeeded();
   try{await materialize(db,issuer,market);}
   catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;return afterPublish(code,e);}   // published stays; retried on the failure schedule
+  // 9b (plan 3 §4.5): acceptance times; best-effort after publication — errors are recorded, the outcome stays published
+  if(market==='US'&&deps.enrichAcceptance&&!budget.signal.aborted&&budget.remainingMs()>0){
+   try{const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);}
+   catch(e){out.errors.push({code:'acceptance_failed',key:issuer,message:errMsg(e)});}
+  }
   await releaseOnce('success');
   return out;
  }catch(e){

exec
/bin/zsh -lc "cat src/lib/entities/identifiers/sec-submissions.ts; cat src/lib/dq/batches.ts; sed -n '100,180p' src/lib/facts/sync.ts; rg -n 'filingsOfIssuer|setFilingAcceptance' src/lib/facts/db.ts; find . -iname '*agents*' -o -name CLAUDE.md; cat ~/.codex/config.toml | grep -A5 -B2 fallback" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 62ms:
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
const PARSE_FIELDS=new Set<string>([...TUSHARE_CONTROL_FIELDS,...EDGAR_NUMBER_SCHEMA.control,...EDGAR_NUMBER_SCHEMA.decimal,...FACT_CONCEPTS.map(c=>c.id)]);
const safeParseMessage=(raw:string):string=>{
 const parts=raw.replace(/^parse_error: /,'').split(':').map(x=>x.trim());
 if(parts[0]==='json')return PARSE_KINDS.has(parts[1]??'')?`json: ${parts[1]}`:'json';
 if(parts[0]==='invalid_control_field')return PARSE_FIELDS.has(parts[1]??'')?`invalid_control_field: ${parts[1]}`:'invalid_control_field';
 return PARSE_KINDS.has(parts[0])?parts[0]:'parse_error';
};
const dbCode=(e:unknown)=>e instanceof FactsDbError?e.code:null;
/** lease_lost, or a run another batch already abandoned (its begin_sync_run took the lease over). */
const isLeaseLoss=(e:unknown)=>{const c=dbCode(e);return c==='lease_lost'||c==='run_abandoned';};
const datasetOf=DATASETS.facts;
const sourceOf=(m:Market):Source=>m==='US'?'edgar':'tushare';
const summary=(key:string,reason:string):BatchError=>({code:'skipped_summary',key,message:JSON.stringify({[reason]:1})});
const MAX_SKIP_REASONS=20;
/** One skipped_summary(parser) per issuer: the adapter's skip counters, top MAX_SKIP_REASONS by count, the rest folded into `_more` (round-1 #12). */
const skippedSummary=(issuer:string,skipped:{reason:string;n:number}[]):BatchError=>{
 const sorted=[...skipped].sort((a,b)=>b.n-a.n||a.reason.localeCompare(b.reason));
 const body:Record<string,number>=Object.fromEntries(sorted.slice(0,MAX_SKIP_REASONS).map(s=>[s.reason,s.n]));
 if(sorted.length>MAX_SKIP_REASONS)body._more=sorted.slice(MAX_SKIP_REASONS).reduce((n,s)=>n+s.n,0);
 return {code:'skipped_summary',key:`${issuer}:parser`,message:JSON.stringify(body)};
};
/** `<api>:rt<n>` → `<first year>-<last year>:<distinct end dates>`; compact enough for the 500-char batch error message cap. */
const compactCoverage=(entries:CoverageEntry[]):string=>JSON.stringify(Object.fromEntries(entries.map(e=>{const ys=Object.keys(e.years).sort();return [`${e.api}:rt${e.report_type}`,`${ys[0]??''}-${ys.at(-1)??''}:${Object.values(e.years).reduce((n,v)=>n+v,0)}`];})));

/** Remaining time and an abort signal that fires at the deadline; no deadline means unlimited. */
export function makeBudget(deadline:Date|null,now:()=>Date=()=>new Date()):Budget{
 if(deadline===null)return {remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal};
 const remainingMs=()=>Math.max(0,deadline.getTime()-now().getTime());
 return {remainingMs,signal:AbortSignal.timeout(remainingMs())};
}

/** VERCEL_GIT_COMMIT_SHA, else `git rev-parse HEAD` with -dirty when the tree has changes; null when neither is available. */
export function resolveCodeVersion(env:Record<string,string|undefined>=process.env,exec:(cmd:string,args:string[])=>string=(c,a)=>execFileSync(c,a,{encoding:'utf8',stdio:['ignore','pipe','ignore']})):string|null{
 const sha=env.VERCEL_GIT_COMMIT_SHA;
 if(sha!==undefined&&/^[0-9a-f]{40}$/.test(sha))return sha;
 try{
  const head=exec('git',['rev-parse','HEAD']).trim();
  if(!/^[0-9a-f]{40}$/.test(head))return null;
  return exec('git',['status','--porcelain']).trim().length>0?`${head}-dirty`:head;
 }catch{return null;}
}

interface Staged{parsed:ParseResult;filingIds:Map<string,string>;filingRows:Map<string,FilingRow>}
interface Fetched{parsed:ParseResult;sha256s:string[]}
const keyOfCandidate=(c:FactCandidate)=>({concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,consolidation:c.consolidation,unit:c.unit});
/** missing_available_date natural key (spec §7.1 `<issuer>:<ts_code>:<end_date>:<report_type>`; EDGAR rows carry accn/tag in those slots). */
const missingDateKey=(issuer:string,fetchKey:string,r:Record<string,unknown>)=>{
 const s=(v:unknown)=>v===undefined||v===null?'':String(v);
 // One accession carries many periods and units, and one Tushare statement many rows: the key names each source row (round-3 #2; deviates from spec §7.1's coarser key).
 if('accn' in r)return [issuer,fetchKey,s(r.accn),s(r.tag),s(r.start),s(r.end),s(r.unit)].join(':');
 return [issuer,fetchKey,s(r.end_date),s(r.report_type),s(r.api),s(r.page),s(r.row)].join(':');
};

async function fetchAndParse(deps:SyncDeps,market:Market,issuer:string,fetchKey:string,sinceYear:number,budget:Budget,store:boolean):Promise<Fetched>{
 const snapshots:RawSnapshot[]=market==='US'?[await deps.fetchUs(fetchKey,budget)]:await deps.fetchCn(fetchKey,sinceYear,budget);
 // Evidence integrity: what is stored and parsed must be the bytes the declared hash names; checked BEFORE anything is stored (round-3 #8, round-4 #8).
 for(const s of snapshots)if(createHash('sha256').update(s.bytes).digest('hex')!==s.sha256)throw new SyncError('snapshot_hash_mismatch');
 if(store)for(const s of snapshots)await deps.storage.put(s,snapshotPath(sourceOf(market),issuer,s.sha256),budget);
 const sha256s=snapshots.map(s=>s.sha256);
 let parsed:ParseResult;
 try{parsed=market==='US'?deps.parseUs(snapshots[0],{sinceYear}):deps.parseCn(snapshots,{sinceYear});}
 catch(e){throw new SyncError('parse_error',e instanceof Error?e.message:'unknown');}   // sanitised by safeParseMessage when recorded
 // raw_hash is sha256(snapshot.sha256 + locator), so membership in the snapshot hashes cannot be checked
 // here; the shape (64 hex) is, and it catches adapters that forgot to derive it.
 if(parsed.candidates.some(c=>!/^[0-9a-f]{64}$/.test(c.rawHash)))throw new SyncError('parse_error','raw_hash_invalid');
 return {parsed,sha256s};
}

export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:ScopeRow;market:Market;sinceYear:number;mappingGen?:number;budget:Budget}):Promise<IssuerOutcome>{
 const {db,tables}=deps;const {scope,market,sinceYear,budget}=input;const issuer=scope.issuer_id;const gen=input.mappingGen??MAPPING_GEN;const dataset=datasetOf(market);
 const out:IssuerOutcome={issuerId:issuer,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
 const skip=(reason:string)=>{out.code=reason;out.errors.push(summary(issuer,reason));return out;};
 const [issuerRow]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 if(issuerRow?.status==='merged')return skip('issuer_merged');
 if(!await db.claimLease(issuer,market,batchId,LEASE_TTL_S))return skip('leased');
 // Lease/run session. Counter contract (round-4 #4): fetched = candidates + parser-level rows
 // (ambiguous candidates, odd durations, rows without a date). After a published run
 // inserted + versioned + duplicates + quarantined = fetched and failed = 0; after a failure the rows
 // whose quarantine item survives stay counted as quarantined and failed = fetched - those (at least 1).
 let leaseUntil=deps.now().getTime()+LEASE_TTL_S*1000;
 let leaseHeld=true,released=false,abandoned=false,publishedRun=false;let runId:string|null=null;
4:// use .from() under RLS (factsByIds, openConflicts, filingsOfIssuer, scopeDue, metricsOfIssuer,
203:  async filingsOfIssuer(issuer,market,opts){
271:  async setFilingAcceptance(filingId,acceptedAt,source){return (await call<unknown>('set_filing_acceptance',{p_filing:filingId,p_accepted:acceptedAt,p_source:source}))===true;},
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

exec
/bin/zsh -lc "sed -n '195,225p' src/lib/facts/db.ts; cat src/lib/db/table-client.ts | tail -75; sed -n '300,450p' src/lib/facts/sync.ts; rg -n 'set_filing_acceptance|accepted_at' supabase/migrations/* | tail -30; ls -a .claude; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*' " in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
  async factsByIds(ids){
   const out:FactRow[]=[];
   for(const part of chunkIds([...new Set(ids)]))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('financial_facts').select('*').in('fact_id',part).order('fact_id'))).map(factRowFromTable));
   return out.sort((a,b)=>a.fact_id<b.fact_id?-1:a.fact_id>b.fact_id?1:0);   // deduped, ordered by fact_id across chunks
  },
  async openConflicts(issuer,market){
   return (await pageAll<{id:string;natural_key:string;payload:Record<string,unknown>}>(()=>c.from('dq_quarantine').select('id,natural_key,payload').eq('table_name','financial_facts').eq('reason_code','same_day_conflict').eq('status','open').like('natural_key',`${conflictPrefix(issuer,market)}%`).order('created_at').order('id'))).map(conflictFromItem);
  },
  async filingsOfIssuer(issuer,market,opts){
   return (await pageAll<Record<string,unknown>>(()=>{
    let q=c.from('filings').select('*').eq('issuer_id',issuer).eq('market',market);
    if(opts.from!==undefined)q=q.gte('available_date',opts.from);
    if(opts.to!==undefined)q=q.lte('available_date',opts.to);
    if(opts.unlinkedOnly)q=q.is('document_ref',null);
    return q.order('available_date',{ascending:false}).order('filing_id');
   },opts.limit)).map(filingFromTable);
  },
  async updateFilingLink(filingId,patch){const {error}=await c.from('filings').update(linkPatch(patch)).eq('filing_id',filingId);if(error)throw toFactsDbError(error);},
  async reconcileScope(market,input,snapshotAt){return Number(await call<unknown>('reconcile_fact_sync_scope',{p_market:market,p_rows:input,p_snapshot_at:snapshotAt??null}));},
  async scopeDue(market,now,limit){
   if(limit<1)return [];
   return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).gt('priority',0).lte('next_due_at',now).order('next_due_at').order('priority',{ascending:false}).order('issuer_id'),limit)).map(scopeFromTable);
  },
  async scopeRows(market,issuerIds){
   const out:ScopeRow[]=[];
   for(const part of chunkIds(issuerIds))out.push(...(await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).in('issuer_id',part).order('issuer_id'))).map(scopeFromTable));
   return out;
  },
  async scopeAll(market){return (await pageAll<Record<string,unknown>>(()=>c.from('fact_sync_scope').select('*').eq('market',market).order('issuer_id'))).map(scopeFromTable);},
  async metricsOfIssuer(issuer,market,formulaVersion){
   // Pages may span a concurrent replace_financial_metrics: accept a read only when every row carries
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
   if(publishedRun)return afterPublish('deadline_hit',e);
   // With time left, clean up; without it the staged run (and the lease, which expires by itself) is left for the next beginRun.
   if(budget.remainingMs()>=CLEANUP_MIN_MS)await cleanup('failed');
   out.counts.fetched=out.counts.quarantined;   // only rows whose quarantine item survives were handled
   out.outcome='failed';out.code='deadline_hit';out.errors.push({code:'deadline_hit',key:issuer});return out;
  }
  if(publishedRun)return afterPublish(e instanceof SyncError?e.code:dbCode(e)??'unknown',e);
  await cleanup('failed');
  if(e instanceof SyncError)return fail(e.code,e.code==='parse_error'?safeParseMessage(e.message):undefined);
  return fail('unknown',errMsg(e));
 }
}

/** Stages this run's filings (existing source_refs keep their id) and returns the issuer's filing rows by id. */
async function stageFilings(db:FactsDb,runId:string,issuer:string,market:Market,parsed:ParseResult):Promise<Staged>{
 const known=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.source_ref,f.filing_id]));
 const rows:FilingInsert[]=parsed.filings.map(f=>({...f,filing_id:known.get(f.sourceRef)??randomUUID(),issuer_id:issuer}));
 const filingIds=await db.stageFilings(runId,rows);
 const filingRows=new Map((await db.filingsOfIssuer(issuer,market,{})).map(f=>[f.filing_id,f]));
 for(const f of parsed.filings){
  const id=filingIds.get(f.sourceRef);
  if(id===undefined||!filingRows.has(id))throw new SyncError('parse_error',`filing_not_staged:${f.sourceRef}`);
 }
 return {parsed,filingIds,filingRows};
}

async function linkFilings(deps:SyncDeps,issuer:string,market:Market,budget:Budget,out:IssuerOutcome,renew:()=>Promise<void>):Promise<void>{
 const pending=(await deps.db.filingsOfIssuer(issuer,market,{unlinkedOnly:true})).filter(f=>f.link_attempts<MAX_LINK_ATTEMPTS&&f.origin!=='bse'&&LINKABLE_FORMS.has(f.form_type));
 let failed=0,unlinkable=0;
 for(const f of pending){
  // Cancellation BEFORE a request starts is not an attempt: link_attempts stays untouched (round-1 #21).
  if(budget.signal.aborted||budget.remainingMs()<MIN_ISSUER_MS/3)break;
  await renew();                                         // lease_lost propagates: the issuer stays published
  let patch:{document_ref?:string;document_url?:string;link_attempts:number}={link_attempts:f.link_attempts+1};
  let cut=false;
  try{
   const r=await deps.linkCn!(f,budget);
   if(r==='unlinkable'){unlinkable++;continue;}   // no request was possible: nothing persisted, no attempt consumed
   if(typeof r!=='string')patch={...r,link_attempts:f.link_attempts+1};
  }catch(e){
   if(dbCode(e)==='lease_lost')throw e;
   failed++;                                             // transport/HTTP failure OR a request cut by the budget: a started request is an attempt (§6.3; round-2 #21)
   cut=budget.signal.aborted;
  }
  await deps.db.updateFilingLink(f.filing_id,patch);     // none / ambiguous / success / thrown / cut — every STARTED request is persisted
  if(cut)break;                                          // no budget left for the next request
 }
 if(failed>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_link`,message:JSON.stringify({link_failed:failed})});
 if(unlinkable>0)out.errors.push({code:'skipped_summary',key:`${issuer}:cninfo_unlinkable`,message:JSON.stringify({unlinkable})});
}

type Selected={scope:ScopeRow}|{unresolved:string};
const unresolvedOutcome=(issuerId:string):IssuerOutcome=>({issuerId,fetchKey:'',runId:null,outcome:'failed',code:'scope_unresolved',counts:{...emptyCounts(),failed:1},errors:[{code:'scope_unresolved',key:issuerId}],warnings:new Map(),snapshotSha256:[]});
/**
 * Scheduled path: the due rows. Explicit issuers (round-1 #13): their scope rows by id, in the
 * order given; a missing row is computed from the issuer tables (scopeRowFor) — seeded through
 * reconcileScope when applying (reasons ['explicit'], priority SCOPE_PRIORITY; the next cron
 * reconcile retires it to priority 0 unless a source lists the issuer), constructed read-only for
 * a dry run — and an issuer whose fetch_key cannot be derived is reported, never silently dropped.
 */
async function selectScopes(deps:SyncDeps,opts:SyncOptions):Promise<Selected[]>{
 if(opts.issuerIds===undefined)return (await deps.db.scopeDue(opts.market,deps.now().toISOString(),opts.limit)).map(scope=>({scope}));
 // Every explicitly requested issuer gets an outcome: `limit` bounds the scheduled path only and is
 // never used to silently drop requested ids (round-2 #13).
 const ids=[...new Set(opts.issuerIds)];
 // A set_merge placeholder (fetch_key 'topology', priority 0) is not a usable schedule row: treat it as missing and derive the real key.
 const have=new Map((await deps.db.scopeRows(opts.market,ids)).filter(s=>s.fetch_key!=='topology').map(s=>[s.issuer_id,s]));
 const today=isoDate(deps.now());const seed:ScopeInputRow[]=[];
 for(const id of ids){
  if(have.has(id))continue;
  const row=await scopeRowFor(deps.tables,opts.market,id,{today});
  if(row===null)continue;
  if(opts.dryRun)have.set(id,{...row,market:opts.market,next_due_at:deps.now().toISOString(),lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null});
  else seed.push(row);
 }
 if(seed.length>0){
  await deps.db.reconcileScope(opts.market,seed);
  for(const s of await deps.db.scopeRows(opts.market,seed.map(r=>r.issuer_id)))have.set(s.issuer_id,s);
 }
 return ids.map(id=>{const scope=have.get(id);return scope?{scope}:{unresolved:id};});
}

/** Dry run: fetch, parse and plan against the current rows, write nothing (no batch, lease, snapshot or run). Planned issuers report outcome 'planned'. */
async function dryRun(deps:SyncDeps,opts:SyncOptions,sinceYear:number,gen:number,budget:Budget):Promise<SyncReceipt> {
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];
 const selected=await selectScopes(deps,opts);
 let failed=0;
 for(const sel of selected){
  if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
  const scope=sel.scope;
  const out:IssuerOutcome={issuerId:scope.issuer_id,fetchKey:scope.fetch_key,runId:null,outcome:'skipped',counts:emptyCounts(),errors:[],warnings:new Map(),snapshotSha256:[]};
  try{
   const {parsed,sha256s}=await fetchAndParse(deps,opts.market,scope.issuer_id,scope.fetch_key,sinceYear,budget,false);
   out.snapshotSha256=sha256s;
   const known=new Map((await deps.db.filingsOfIssuer(scope.issuer_id,opts.market,{})).map(f=>[f.source_ref,f.filing_id]));
   const filings=new Map(parsed.filings.map(f=>[f.sourceRef,known.get(f.sourceRef)??randomUUID()]));
   const read=await deps.db.readFacts(scope.issuer_id,opts.market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
   if(read.truncated)throw new FactsDbError('read_truncated');
   const plan=planFactWrites({existing:read.rows,openConflicts:await deps.db.openConflicts(scope.issuer_id,opts.market),candidates:parsed.candidates,filingCandidates:parsed.filings,filings,issuerId:scope.issuer_id,market:opts.market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
   Object.assign(out.counts,{fetched:parsed.candidates.length,...plan.counts});out.outcome='planned';
  }catch(e){failed++;out.outcome='failed';out.code=e instanceof SyncError?e.code:dbCode(e)??'unknown';out.errors.push({code:out.code,key:scope.issuer_id,message:e instanceof SyncError&&e.code==='parse_error'?safeParseMessage(e.message):errMsg(e)});}
  issuers.push(out);for(const k of COUNTERS)counts[k]+=out.counts[k];errors.push(...out.errors);
 }
 const idle=selected.length===0;
 return {batchId:null,status:'dry_run',counts,errors,issuers,idle,detail:{attempted:selected.length,published:0,failed,skipped:0,idle}};
}

export async function runFactsSync(deps:SyncDeps,opts:SyncOptions):Promise<SyncReceipt>{
 const {market}=opts;const dataset=datasetOf(market);
 const sinceYear=opts.sinceYear??deps.now().getUTCFullYear()-10;const gen=opts.mappingGen??MAPPING_GEN;
 const budget=makeBudget(deps.deadline,deps.now);
 if(opts.dryRun)return dryRun(deps,opts,sinceYear,gen,budget);
 if(deps.codeVersion===null||deps.codeVersion==='')throw new SyncError('code_version_unavailable');
 const {batchId}=await startBatch(deps.tables,{producer:'facts-sync',dataset,toolVersions:{mapping_gen:String(gen),rules:RULES_VERSION,formula:FORMULA_VERSION,source:sourceOf(market)},codeVersion:deps.codeVersion,triggeredBy:opts.triggeredBy});
 const counts=emptyCounts();const errors:BatchError[]=[];const issuers:IssuerOutcome[]=[];const warnings=new Map<string,string[]>();
 let attempted=0,published=0,failed=0,skipped=0,quota=false,idle=false;
 try{
  // Scheduled path (cron): reconcile the scope first (spec §6.1). Explicit issuers (scripts, replay
  // tests) skip it: their scope rows were put there by the caller and must not be retired by sources
  // the caller does not control.
  if(opts.issuerIds===undefined)await reconcileScope({db:deps.db,tables:deps.tables},market);
  const selected=await selectScopes(deps,opts);
  idle=selected.length===0;
  for(let i=0;i<selected.length;i++){
   const sel=selected[i];
   if('unresolved' in sel){const u=unresolvedOutcome(sel.unresolved);attempted++;failed++;issuers.push(u);counts.failed+=1;errors.push(...u.errors);continue;}
   const scope=sel.scope;
   if(quota){skipped++;errors.push(summary(scope.issuer_id,'quota_exhausted'));continue;}
   if(budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:selected.length-i})});break;}
   attempted++;
   const r=await syncIssuerFacts(deps,batchId,{scope,market,sinceYear,mappingGen:gen,budget});
   issuers.push(r);for(const k of COUNTERS)counts[k]+=r.counts[k];errors.push(...r.errors);mergeWarnings(warnings,r.warnings);
   if(r.outcome==='published')published++;else if(r.outcome==='failed')failed++;else skipped++;
   if(r.code==='quota_exhausted')quota=true;
  }
  errors.push(...summarizeWarnings(warnings));
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  const ok=idle||published>=Math.max(1,Math.ceil(attempted/2));
  const detail:SyncDetail={attempted,published,failed,skipped,idle};
  await recordAttempt(deps.tables,dataset,{ok,cadence:inventoryEntry(dataset).cadence,now:deps.now(),detail:{...detail}});
  return {batchId,status,counts,errors,issuers,idle,detail};
 }catch(e){
  // Infrastructure failure outside an issuer: close the receipt so no running batch dangles, then rethrow.
  errors.push({code:'unknown',message:errMsg(e)});
  try{await finishBatch(deps.tables,batchId,{counts,errors},deps.now());}catch{/* left running; runbook SQL marks it failed */}
  try{await recordAttempt(deps.tables,dataset,{ok:false,cadence:inventoryEntry(dataset).cadence,now:deps.now(),detail:{attempted,published,failed,skipped,idle,error:errMsg(e)}});}catch{/* same */}
  throw e;
 }
}
supabase/migrations/20261107091000_facts_extensions.sql:4:--  1. filings.accepted_at / acceptance_source: set once (null → value) and only by
supabase/migrations/20261107091000_facts_extensions.sql:5:--     set_filing_acceptance (transaction-local facts.allow_acceptance_write); no role has a column
supabase/migrations/20261107091000_facts_extensions.sql:34:  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'filings' and column_name = 'accepted_at') then
supabase/migrations/20261107091000_facts_extensions.sql:35:    alter table public.filings add column accepted_at timestamptz, add column acceptance_source text;
supabase/migrations/20261107091000_facts_extensions.sql:41:    alter table public.filings add constraint filings_acceptance_pair check ((accepted_at is null) = (acceptance_source is null));
supabase/migrations/20261107091000_facts_extensions.sql:46:-- never decreases, delete only under facts.allow_filing_delete) plus: accepted_at/acceptance_source
supabase/migrations/20261107091000_facts_extensions.sql:47:-- go null → value once, and only while set_filing_acceptance has facts.allow_acceptance_write on.
supabase/migrations/20261107091000_facts_extensions.sql:50:declare v_mutable text[] := array['document_ref','document_url','link_attempts','mapping_gen','accepted_at','acceptance_source'];
supabase/migrations/20261107091000_facts_extensions.sql:59:    raise exception 'append_only: filings allow document_ref, document_url, link_attempts, mapping_gen, accepted_at and acceptance_source changes only' using errcode = '23514';
supabase/migrations/20261107091000_facts_extensions.sql:64:  if (new.accepted_at, new.acceptance_source) is distinct from (old.accepted_at, old.acceptance_source) then
supabase/migrations/20261107091000_facts_extensions.sql:65:    if old.accepted_at is not null or old.acceptance_source is not null then
supabase/migrations/20261107091000_facts_extensions.sql:66:      raise exception 'append_only: filings.accepted_at is set once (null -> value)' using errcode = '23514';
supabase/migrations/20261107091000_facts_extensions.sql:69:      raise exception 'append_only: filings.accepted_at is written only by set_filing_acceptance' using errcode = '23514';
supabase/migrations/20261107091000_facts_extensions.sql:75:-- accepted_at is null → write, true; the same value and source → false; another value → acceptance_conflict.
supabase/migrations/20261107091000_facts_extensions.sql:76:create or replace function public.set_filing_acceptance(p_filing uuid, p_accepted timestamptz, p_source text)
supabase/migrations/20261107091000_facts_extensions.sql:84:  if g.accepted_at is null then
supabase/migrations/20261107091000_facts_extensions.sql:86:    update public.filings set accepted_at = p_accepted, acceptance_source = p_source where filing_id = p_filing;
supabase/migrations/20261107091000_facts_extensions.sql:90:  if g.accepted_at = p_accepted and g.acceptance_source = p_source then return false; end if;
supabase/migrations/20261107091000_facts_extensions.sql:93:revoke execute on function public.set_filing_acceptance(uuid, timestamptz, text) from public, anon, authenticated;
supabase/migrations/20261107091000_facts_extensions.sql:94:grant execute on function public.set_filing_acceptance(uuid, timestamptz, text) to service_role;
.
..
agents
launch.json
scratch

exec
/bin/zsh -lc 'for d in / /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for n in AGENTS.override.md AGENTS.md; do [ ! -f "$d/$n" ] || { echo "$d/$n"; cat "$d/$n"; }; done; done; nl -ba src/lib/facts/providers/sec-acceptance.ts | tail -42; nl -ba src/lib/facts/sync.ts | sed -n '"'283,300p'; cat src/app/api/cron/facts-sync/route.ts | head -100" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>    71	  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
    72	  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
    73	   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
    74	   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
    75	}
    76	
    77	export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget):Promise<AcceptanceOutcome>{
    78	 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
    79	 const pending=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
    80	 if(pending.length===0)return out;
    81	 let snap:SubmissionsSnapshot;
    82	 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
    83	 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
    84	 out.snapshotSha256=snap.main.sha256;
    85	 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
    86	 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
    87	 let notFound=0,unrecorded=0;
    88	 for(const f of pending){
    89	  const e=index.get(f.source_ref);
    90	  if(!e||e.acceptedAt===null){notFound++;continue;}
    91	  out.counts.fetched++;
    92	  if(e.filingDate!==f.available_date){
    93	   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
    94	   if(deps.recordDateMismatch){
    95	    try{await deps.recordDateMismatch(r);}
    96	    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
    97	   }else unrecorded++;
    98	   continue;
    99	  }
   100	  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
   101	  catch(err){
   102	   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   103	   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
   104	  }
   105	 }
   106	 const summary:Record<string,number>={};
   107	 if(notFound>0)summary.acceptance_not_found=notFound;
   108	 if(ambiguous.length>0)summary.acceptance_ambiguous=ambiguous.length;
   109	 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
   110	 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
   111	 return out;
   112	}
   283	  out.outcome='published';
   284	  for(const k of ['inserted','versioned','duplicates','quarantined'] as const)out.counts[k]+=committed[k];
   285	  if(market==='CN'&&deps.linkCn)await linkFilings(deps,issuer,market,budget,out,renewIfNeeded);
   286	  if(budget.signal.aborted||budget.remainingMs()<=0)return afterPublish('deadline_hit',new Error('materialize_not_started'));
   287	  await renewIfNeeded();
   288	  try{await materialize(db,issuer,market);}
   289	  catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;return afterPublish(code,e);}   // published stays; retried on the failure schedule
   290	  // 9b (plan 3 §4.5): acceptance times; best-effort after publication — errors are recorded, the outcome stays published
   291	  if(market==='US'&&deps.enrichAcceptance&&!budget.signal.aborted&&budget.remainingMs()>0){
   292	   try{const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);}
   293	   catch(e){out.errors.push({code:'acceptance_failed',key:issuer,message:errMsg(e)});}
   294	  }
   295	  await releaseOnce('success');
   296	  return out;
   297	 }catch(e){
   298	  if(isLeaseLoss(e)){leaseHeld=false;if(publishedRun){out.errors.push({code:'lease_lost',key:issuer});return out;}return fail('lease_lost');}
   299	  if(isDeadline(e,budget)){
   300	   if(publishedRun)return afterPublish('deadline_hit',e);
// src/app/api/cron/facts-sync/route.ts
// Facts sync trigger (spec §6.5): CRON_SECRET bearer (same check as securities-sync), market US|CN,
// limit 1..200 (default 25), maxDuration 300 with a 240 s deadline handed to the sync core, which
// stops starting issuers when the remaining budget is under 90 s (deadline_hit). A missing
// code_version refuses the run (spec §6.1). Returns the batch receipt.
// Vercel may deliver one cron event more than once (the batch lease makes a duplicate run harmless:
// issuers held by the first run are skipped as 'leased'), and sub-daily crons (this one is every 4 h)
// need a Vercel Pro plan. The HTTP receipt carries codes and counts only: no error messages.
// CN is gated: the route refuses market=CN unless FACTS_CN_ENABLED=1 (no Tushare token / real CN
// fixtures yet; vercel.json schedules US only).
import {timingSafeEqual} from 'node:crypto';
import {NextResponse} from 'next/server';
import {runFactsSync} from '@/lib/facts/sync';
import type {SyncReceipt} from '@/lib/facts/sync';
import {SyncError} from '@/lib/facts/errors';
import {productionSyncDeps,resolveCodeVersion} from '@/lib/facts/deps';
import type {Market} from '@/lib/facts/types';

export const dynamic='force-dynamic';
export const maxDuration=300;
const DEADLINE_MS=240_000,DEFAULT_LIMIT=25,MAX_LIMIT=200;
const err=(code:string,message:string,status:number)=>NextResponse.json({error:{code,message}},{status,headers:{'Cache-Control':'no-store'}});

/** Receipt for the HTTP body: codes, keys and counts; never messages, warnings or snapshot hashes. */
function publicReceipt(r:SyncReceipt){
 const errs=(list:{code:string;key?:string}[])=>list.map(e=>e.key===undefined?{code:e.code}:{code:e.code,key:e.key});
 return {batchId:r.batchId,status:r.status,counts:r.counts,errors:errs(r.errors),idle:r.idle,detail:r.detail,
  issuers:r.issuers.map(i=>({issuerId:i.issuerId,fetchKey:i.fetchKey,outcome:i.outcome,code:i.code,counts:i.counts,errors:errs(i.errors)}))};
}

function authorized(auth:string|null,secret:string):boolean{
 const expected=Buffer.from(`Bearer ${secret}`),actual=Buffer.from(auth??'');
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

async function run(request:Request):Promise<NextResponse>{
 const secret=process.env.CRON_SECRET;
 if(!secret)return err('cron_unavailable','Cron unavailable',503);
 if(!authorized(request.headers.get('authorization'),secret))return err('unauthorized','Unauthorized',401);
 const url=new URL(request.url);
 if(url.searchParams.getAll('limit').length>1)return err('invalid_parameter:limit','limit may be given once',400);
 if(url.searchParams.getAll('market').length!==1)return err('invalid_parameter:market','market required once',400);
 const market=url.searchParams.get('market');
 if(market!=='US'&&market!=='CN')return err('invalid_parameter:market','market must be US or CN',400);
 const limitRaw=url.searchParams.get('limit');
 let limit=DEFAULT_LIMIT;
 if(limitRaw!==null){if(!/^\d{1,3}$/.test(limitRaw)||Number(limitRaw)<1||Number(limitRaw)>MAX_LIMIT)return err('invalid_parameter:limit',`limit must be 1..${MAX_LIMIT}`,400);limit=Number(limitRaw);}
 if(market==='CN'&&process.env.FACTS_CN_ENABLED!=='1')return err('cn_disabled','CN facts sync is not enabled (FACTS_CN_ENABLED)',403);
 const codeVersion=resolveCodeVersion({allowGit:false});
 if(!codeVersion)return err('code_version_unavailable','VERCEL_GIT_COMMIT_SHA not set',503);
 const started=new Date();
 try{
  const deps=productionSyncDeps({deadline:new Date(started.getTime()+DEADLINE_MS),codeVersion});
  const receipt=await runFactsSync(deps,{market:market as Market,limit,dryRun:false,triggeredBy:'cron'});
  return NextResponse.json({ok:receipt.status==='success',market,limit,started_at:started.toISOString(),receipt:publicReceipt(receipt)},{status:200,headers:{'Cache-Control':'no-store'}});
 }catch(e){
  return err(e instanceof SyncError?e.code:'sync_failed','Facts sync failed',500);   // code only: no message leaves the server
 }
}

export async function GET(request:Request){return run(request);}
export async function POST(request:Request){return run(request);}

codex
Acceptance failures can be reported as successful syncs, and the new write loop does not honor the cron execution budget.

Full review comments:

- [P2] Propagate acceptance mismatch failures into the sync receipt — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/sync.ts:292-292
  When a filing date disagrees with SEC submissions, enrichment increments `a.counts.failed` but production wiring returns only an informational `skipped_summary` error. This caller discards the counts and mismatches, so `finishBatch` reports success despite the failed acceptance enrichment. Preserve the facts counter contract by adding a non-informational error when acceptance failures occur, or track acceptance outcomes separately so these failures affect batch status.

- [P2] Check the remaining budget before each acceptance write — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/providers/sec-acceptance.ts:88-90
  If submissions fetching finishes near the cron deadline, this loop still performs sequential database RPCs for every pending filing. The budget is only passed to the submissions fetch; `setFilingAcceptance` neither receives nor checks it. An issuer with a large backlog or slow database responses can therefore exceed the 240-second deadline and potentially the route's 300-second execution limit, preventing batch finalization. Stop starting writes when the budget expires and return an explicit incomplete outcome.
Acceptance failures can be reported as successful syncs, and the new write loop does not honor the cron execution budget.

Full review comments:

- [P2] Propagate acceptance mismatch failures into the sync receipt — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/sync.ts:292-292
  When a filing date disagrees with SEC submissions, enrichment increments `a.counts.failed` but production wiring returns only an informational `skipped_summary` error. This caller discards the counts and mismatches, so `finishBatch` reports success despite the failed acceptance enrichment. Preserve the facts counter contract by adding a non-informational error when acceptance failures occur, or track acceptance outcomes separately so these failures affect batch status.

- [P2] Check the remaining budget before each acceptance write — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/facts/providers/sec-acceptance.ts:88-90
  If submissions fetching finishes near the cron deadline, this loop still performs sequential database RPCs for every pending filing. The budget is only passed to the submissions fetch; `setFilingAcceptance` neither receives nor checks it. An issuer with a large backlog or slow database responses can therefore exceed the 240-second deadline and potentially the route's 300-second execution limit, preventing batch finalization. Stop starting writes when the budget expires and return an explicit incomplete outcome.

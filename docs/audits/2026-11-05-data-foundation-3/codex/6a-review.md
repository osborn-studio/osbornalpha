OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b01b-d762-7dc2-a33f-380cdb372590
--------
user
commit 09b75c9
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 09b75c9; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 230ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-8qhjz3ir' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hENjVX3h' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6D85Q76b' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rUeT2rJw' (errno=Operation not permitted)
09b75c9 feat(entities): SEC submissions client (UA, 120 ms pacing, pages, raw evidence), former-name aliases, 8-A/25 evidence-only claims, SEC-listed tickers
 .../2026-11-05-data-foundation-3/verification.md   |  15 ++
 scripts/entity-keys/probe-submissions.ts           |  22 +++
 scripts/entity-keys/sec-submissions.ts             |  77 +++++++++
 .../entities/fixtures/sec-submissions/zz-main.json |  24 +++
 .../fixtures/sec-submissions/zz-page-001.json      |   9 ++
 .../entities/identifiers/sec-submissions.test.ts   | 128 +++++++++++++++
 src/lib/entities/identifiers/sec-submissions.ts    | 177 +++++++++++++++++++++
 src/lib/entities/submissions-evidence.test.ts      |  44 +++++
 src/lib/entities/submissions-evidence.ts           |  51 ++++++
 9 files changed, 547 insertions(+)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo ==== $p; cat "$p"; fi; done; ls -a; git show 09b75c9 -- src scripts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then printf '"'\\n%s\\n' \""'$p"; cat "$p"; fi; done; ls -a; git show 09b75c9 -- src scripts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jpJFHVOw' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-EZ9yUi3F' (errno=Operation not permitted)
commit 09b75c95fda90fb8987f6e443f0a94d665903ddf
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:06:03 2026 -0800

    feat(entities): SEC submissions client (UA, 120 ms pacing, pages, raw evidence), former-name aliases, 8-A/25 evidence-only claims, SEC-listed tickers
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/probe-submissions.ts b/scripts/entity-keys/probe-submissions.ts
new file mode 100644
index 0000000..71b0042
--- /dev/null
+++ b/scripts/entity-keys/probe-submissions.ts
@@ -0,0 +1,22 @@
+/**
+ * Verification helper for spec §14-9 (Task 6a Step 9): fetches one CIK's submissions including
+ * every filings.files[] page and prints the page structure the parser saw. No database access.
+ *   npx tsx scripts/entity-keys/probe-submissions.ts <cik> [<out-dir>]
+ * With <out-dir>, writes the exact main and page bytes there (for a trimmed fixture).
+ */
+import {mkdirSync,writeFileSync} from 'node:fs';
+import {join} from 'node:path';
+import {memoryRawStore} from '../../src/lib/dq/raw-store';
+import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
+
+async function main(){
+ const [cik,out]=process.argv.slice(2);
+ if(!cik){console.error('usage: probe-submissions.ts <cik> [<out-dir>]');process.exit(2);}
+ const raw=memoryRawStore();
+ const s=await fetchSubmissions(cik,{fetch,raw},{coverFrom:'1993-01-01'});
+ const byPage:Record<string,{n:number;earliest:string;latest:string}>={};
+ for(const f of s.parsed.filings){const p=byPage[f.page]??={n:0,earliest:f.filingDate,latest:f.filingDate};p.n++;if(f.filingDate<p.earliest)p.earliest=f.filingDate;if(f.filingDate>p.latest)p.latest=f.filingDate;}
+ console.log(JSON.stringify({cik:s.cik,files:s.parsed.files,complete:s.complete,main:s.main,pages:s.pages,byPage,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,tickers:s.parsed.tickers},null,1));
+ if(out){mkdirSync(out,{recursive:true});for(const [path,bytes] of raw.objects)writeFileSync(join(out,path.split('/').pop()!),bytes);}
+}
+main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exit(1);});
diff --git a/scripts/entity-keys/sec-submissions.ts b/scripts/entity-keys/sec-submissions.ts
new file mode 100644
index 0000000..bfa9b65
--- /dev/null
+++ b/scripts/entity-keys/sec-submissions.ts
@@ -0,0 +1,77 @@
+/**
+ * SEC submissions identity evidence (spec §4.3.3) for US in-scope issuers with a CIK: fetches
+ * submissions (all filings.files[] pages), stores the raw bytes, and writes formerNames aliases,
+ * 8-A/25 evidence_only claims and SEC-listed tickers (first_observed).
+ *   npx tsx scripts/entity-keys/sec-submissions.ts [--issuer <uuid>]... [--apply]
+ * Dry run (default): fetches and prints what would be written (raw bytes hashed in memory only).
+ * --apply records an ingest batch (dataset entities.sec-submissions) and a freshness attempt.
+ * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; EDGAR_USER_AGENT (else DEFAULT_USER_AGENT).
+ */
+import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {SUBMISSIONS_PARSER_VERSION,SecSubmissionsError,submissionsClient,submissionsEvidenceClaims} from '../../src/lib/entities/identifiers/sec-submissions';
+import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
+import {applySubmissionsEvidence} from '../../src/lib/entities/submissions-evidence';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const DATASET=DATASETS.entities.submissions;
+const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+const ALL_PAGES='1993-01-01';
+const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
+const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};
+
+async function main(){
+ const argv=process.argv.slice(2);
+ const ids:string[]=[];let apply=false;
+ for(let i=0;i<argv.length;i++){
+  if(argv[i]==='--apply')apply=true;
+  else if(argv[i]==='--issuer'&&UUID.test(argv[i+1]??''))ids.push(argv[++i].toLowerCase());
+  else{console.error('usage: sec-submissions.ts [--issuer <uuid>]... [--apply]');process.exit(2);}
+ }
+ const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
+ const asOf=new Date().toISOString().slice(0,10);
+ const inScope=new Set((await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(s=>typeof s.priority==='number'&&s.priority>0).map(s=>String(s.issuer_id)));
+ const issuers=(await selectAll(tables,'issuers',{status:'active'},'issuer_id'))
+  .filter(i=>typeof i.cik==='string'&&inScope.has(String(i.issuer_id))&&(ids.length===0||ids.includes(String(i.issuer_id))));
+ const universe=new Set((await selectAll(tables,'stocks_universe',{market:'US'},'ticker')).map(r=>String(r.ticker)));
+ const raw=apply?supabaseRawStore(admin):memoryRawStore();
+ const client=submissionsClient({fetch,raw});
+ const batchId=apply?(await startBatch(tables,{producer:'sec-submissions',dataset:DATASET,toolVersions:{parser:SUBMISSIONS_PARSER_VERSION,as_of:asOf}})).batchId:null;
+ const counts=emptyCounts();let errors:BatchError[]=[];let status:BatchStatus='failed';
+ const preview:Record<string,unknown>[]=[];
+ try{
+  for(const i of issuers){
+   const issuerId=String(i.issuer_id),cik=String(i.cik);
+   try{
+    const snapshot=await client.fetch(cik,{coverFrom:ALL_PAGES});
+    const open=await tables.select('issuer_securities',{issuer_id:issuerId,valid_to:null},{orderBy:'ticker'});
+    const primary=[...open].sort((a,b)=>Number(b.is_primary===true)-Number(a.is_primary===true))[0];
+    const primaryTicker=primary?String(primary.ticker):null;
+    if(!batchId){
+     preview.push({cik,formerNames:snapshot.parsed.formerNames.length,evidenceClaims:submissionsEvidenceClaims(issuerId,snapshot,asOf).length,
+      secOnlyTickers:snapshot.parsed.tickers.filter(t=>!open.some(r=>r.ticker===t)),pages:snapshot.pages.length,complete:snapshot.complete});
+     continue;
+    }
+    const res=await applySubmissionsEvidence(tables,{issuerId,primaryTicker,snapshot,asOf,batchId,dataset:DATASET,universe});
+    add(counts,res.counts);errors=[...errors,...res.errors];
+   }catch(e){
+    counts.failed++;
+    errors.push({code:e instanceof SecSubmissionsError?e.code:'exception',key:cik,message:errorMessage(e)});
+   }
+  }
+ }finally{
+  if(batchId){
+   try{status=await finishBatch(tables,batchId,{counts,errors});}
+   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
+  }
+ }
+ if(!batchId){console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',issuers:issuers.length,preview,errors},null,1));return;}
+ const outcome=loaderOutcome(status,counts);
+ await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
+ console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
+ process.exitCode=outcome.exitCode;
+}
+main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
diff --git a/src/lib/entities/fixtures/sec-submissions/zz-main.json b/src/lib/entities/fixtures/sec-submissions/zz-main.json
new file mode 100644
index 0000000..f08a6ce
--- /dev/null
+++ b/src/lib/entities/fixtures/sec-submissions/zz-main.json
@@ -0,0 +1,24 @@
+{
+ "cik": "0000999001",
+ "entityType": "operating",
+ "name": "ZZ Fixture Holdings Inc.",
+ "tickers": ["ZZFX"],
+ "exchanges": ["Nasdaq"],
+ "lei": null,
+ "category": "Non-accelerated filer<br>Smaller reporting company",
+ "fiscalYearEnd": "0630",
+ "formerNames": [{"name": "ZZ Fixture Corp", "from": "2001-02-03T00:00:00.000Z", "to": "2015-06-30T00:00:00.000Z"}],
+ "filings": {
+  "recent": {
+   "accessionNumber": ["0000999001-26-000010", "0000999001-25-000031", "0000999001-25-000007"],
+   "filingDate": ["2026-03-02", "2025-09-12", "2025-02-10"],
+   "reportDate": ["2025-12-31", "", "2024-12-31"],
+   "acceptanceDateTime": ["2026-03-02T16:05:11.000Z", "2025-09-12T09:00:00.000Z", "2025-02-10T17:30:00.000Z"],
+   "act": ["34", "34", "34"],
+   "form": ["10-Q", "25-NSE", "10-K"],
+   "primaryDocument": ["zz-20251231.htm", "xslF25X02/primary_doc.xml", "zz-20241231.htm"],
+   "isInlineXBRL": [1, 0, 1]
+  },
+  "files": [{"name": "CIK0000999001-submissions-001.json", "filingCount": 2, "filingFrom": "2001-02-03", "filingTo": "2014-12-31"}]
+ }
+}
diff --git a/src/lib/entities/fixtures/sec-submissions/zz-page-001.json b/src/lib/entities/fixtures/sec-submissions/zz-page-001.json
new file mode 100644
index 0000000..cdb1632
--- /dev/null
+++ b/src/lib/entities/fixtures/sec-submissions/zz-page-001.json
@@ -0,0 +1,9 @@
+{
+ "accessionNumber": ["0000999001-14-000002", "0000999001-01-000001"],
+ "filingDate": ["2014-12-31", "2001-02-05"],
+ "reportDate": ["2014-09-30", ""],
+ "acceptanceDateTime": ["2014-12-31T15:00:00.000Z", "2001-02-05T12:00:00.000Z"],
+ "form": ["10-Q", "8-A12B"],
+ "primaryDocument": ["zz-q3.htm", "zz-8a.htm"],
+ "isInlineXBRL": [0, 0]
+}
diff --git a/src/lib/entities/identifiers/sec-submissions.test.ts b/src/lib/entities/identifiers/sec-submissions.test.ts
new file mode 100644
index 0000000..7eece2e
--- /dev/null
+++ b/src/lib/entities/identifiers/sec-submissions.test.ts
@@ -0,0 +1,128 @@
+// src/lib/entities/identifiers/sec-submissions.test.ts
+import {readFileSync} from 'node:fs';
+import {createHash} from 'node:crypto';
+import {describe,it,expect} from 'vitest';
+import {memoryRawStore} from '../../dq/raw-store';
+import {sanitizeProvenance} from '../provenance';
+import {
+ SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
+ submissionsCategory,submissionsClient,submissionsEvidenceClaims,submissionsUrl,
+} from './sec-submissions';
+
+const read=(rel:string)=>readFileSync(new URL(rel,import.meta.url),'utf8');
+const PLTR=read('../../research/ingest/__fixtures__/collectors/edgar-submissions-1321655.json');
+const MAIN=read('../fixtures/sec-submissions/zz-main.json');
+const PAGE=read('../fixtures/sec-submissions/zz-page-001.json');
+const ISSUER='10000000-0000-4000-8000-000000000009';
+const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
+
+function harness(map:Record<string,()=>Response>){
+ const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
+ const fetch=(async(u:string|URL|Request,init?:RequestInit)=>{const url=String(u);calls.push({url,init:init??{}});const r=map[url];if(!r)throw new TypeError(`fetch failed: ${url}`);return r();}) as typeof globalThis.fetch;
+ const raw=memoryRawStore();
+ return {calls,sleeps,raw,deps:{fetch,raw,userAgent:'ZZ test ua@example.com',now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;},clock:()=>new Date('2026-11-05T08:00:00Z')}};
+}
+const json=(s:string)=>()=>new Response(s,{status:200,headers:{'content-type':'application/json'}});
+const MAIN_URL='https://data.sec.gov/submissions/CIK0000999001.json';
+const PAGE_URL='https://data.sec.gov/submissions/CIK0000999001-submissions-001.json';
+
+describe('parseSubmissions',()=>{
+ it('parses the landed PLTR fixture: category, fiscal year end, former names, tickers, 40 recent filings, no pages',()=>{
+  const p=parseSubmissions(PLTR);
+  expect(p).toMatchObject({cik:'1321655',name:'Palantir Technologies Inc.',category:'Large accelerated filer',fiscalYearEnd:'1231',tickers:['PLTR'],exchanges:['Nasdaq'],files:[]});
+  expect(submissionsCategory(p.category)).toBe('large_accelerated');
+  expect(p.formerNames).toEqual([{name:'Palantir Technologies Inc',from:'2005-03-22T05:00:00.000Z',to:'2011-09-07T04:00:00.000Z'}]);
+  expect(p.filings).toHaveLength(40);
+  expect(p.filings.every(f=>f.page==='recent'&&/^\d{10}-\d{2}-\d{6}$/.test(f.accessionNumber))).toBe(true);
+ });
+ it('maps empty strings to null, 0/1 to booleans, and lists pages',()=>{
+  const p=parseSubmissions(MAIN);
+  expect(p.fiscalYearEnd).toBe('0630');
+  expect(p.filings[1]).toEqual({accessionNumber:'0000999001-25-000031',filingDate:'2025-09-12',reportDate:null,acceptanceDateTime:'2025-09-12T09:00:00.000Z',form:'25-NSE',primaryDocument:'xslF25X02/primary_doc.xml',isInlineXBRL:false,page:'recent',index:1});
+  expect(p.files).toEqual([{name:'CIK0000999001-submissions-001.json',filingCount:2,filingFrom:'2001-02-03',filingTo:'2014-12-31'}]);
+  expect(parseSubmissionsPage(PAGE,'CIK0000999001-submissions-001.json').map(f=>[f.form,f.page])).toEqual([['10-Q','CIK0000999001-submissions-001.json'],['8-A12B','CIK0000999001-submissions-001.json']]);
+ });
+ it('reads filer categories: only SRC (or nothing) is unknown',()=>{
+  expect(submissionsCategory('Large accelerated filer')).toBe('large_accelerated');
+  expect(submissionsCategory('Accelerated filer')).toBe('accelerated');
+  expect(submissionsCategory('Accelerated filer<br>Smaller reporting company')).toBe('accelerated');
+  expect(submissionsCategory('Non-accelerated filer')).toBe('non_accelerated');
+  expect(submissionsCategory('Non-accelerated filer<br>Smaller reporting company')).toBe('non_accelerated');
+  expect(submissionsCategory('Smaller reporting company')).toBe('unknown');
+  expect(submissionsCategory('')).toBe('unknown');expect(submissionsCategory(null)).toBe('unknown');
+ });
+ it('rejects malformed documents with invalid_schema',()=>{
+  const bad=(s:string)=>{try{parseSubmissions(s);return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
+  expect(bad('{')).toBe('invalid_schema');
+  const doc=JSON.parse(MAIN);
+  expect(bad(JSON.stringify({...doc,cik:'abc'}))).toBe('invalid_schema');
+  expect(bad(JSON.stringify({...doc,filings:{...doc.filings,recent:{...doc.filings.recent,form:['10-Q']}}}))).toBe('invalid_schema');
+  expect(bad(JSON.stringify({...doc,filings:{...doc.filings,files:[{name:'../../etc/passwd'}]}}))).toBe('invalid_schema');
+ });
+});
+
+describe('submissionsClient',()=>{
+ it('fetches the main document only by default, with the declared User-Agent, and stores its bytes',async()=>{
+  const h=harness({[MAIN_URL]:json(MAIN)});
+  const s=await fetchSubmissions('999001',h.deps);
+  expect(submissionsUrl('0000999001')).toBe(MAIN_URL);
+  expect(h.calls.map(c=>c.url)).toEqual([MAIN_URL]);
+  expect((h.calls[0].init.headers as Record<string,string>)['User-Agent']).toBe('ZZ test ua@example.com');
+  expect(s).toMatchObject({cik:'999001',fetchedAt:'2026-11-05T08:00:00.000Z',main:{name:'main',sha256:sha(MAIN)},pages:[],complete:false});
+  expect(s.parsed.filings).toHaveLength(3);
+  expect(h.raw.objects.size).toBe(2);   // the document + its .meta.json sidecar
+ });
+ it('fetches the pages a coverFrom date needs, 120 ms apart, merging filings by accession',async()=>{
+  const h=harness({[MAIN_URL]:json(MAIN),[PAGE_URL]:json(PAGE)});
+  const s=await submissionsClient(h.deps).fetch('999001',{coverFrom:'2001-01-01'});
+  expect(h.calls.map(c=>c.url)).toEqual([MAIN_URL,PAGE_URL]);
+  expect(h.sleeps).toEqual([SEC_MIN_INTERVAL_MS]);
+  expect(s.complete).toBe(true);
+  expect(s.pages).toEqual([{name:'CIK0000999001-submissions-001.json',sha256:sha(PAGE),path:expect.any(String)}]);
+  expect(s.parsed.filings.map(f=>f.form)).toEqual(['10-Q','25-NSE','10-K','10-Q','8-A12B']);
+  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
+  const later=await submissionsClient(harness({[MAIN_URL]:json(MAIN)}).deps).fetch('999001',{coverFrom:'2015-01-01'});
+  expect(later.pages).toEqual([]);expect(later.complete).toBe(false);
+ });
+ it('keeps the User-Agent (which may hold an email) out of raw metadata, and stores failure bodies before reporting them',async()=>{
+  const h=harness({[MAIN_URL]:json(MAIN)});
+  await fetchSubmissions('999001',h.deps);
+  const meta=[...h.raw.objects].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('');
+  expect(meta).not.toContain('example.com');expect(meta).toContain('"cik":"999001"');
+  const f=harness({[MAIN_URL]:()=>new Response('nope',{status:503})});
+  await expect(fetchSubmissions('999001',f.deps)).rejects.toMatchObject({code:'sec_unavailable'});
+  expect(f.raw.objects.size).toBe(2);
+  expect(JSON.parse(new TextDecoder().decode([...f.raw.objects].find(([p])=>p.endsWith('.meta.json'))![1]))).toMatchObject({http_status:503});
+ });
+ it('starts no request and no upload once the budget is aborted',async()=>{
+  const h=harness({[MAIN_URL]:json(MAIN)});
+  const ctl=new AbortController();ctl.abort();
+  const budget={remainingMs:()=>60_000,signal:ctl.signal};
+  await expect(fetchSubmissions('999001',{...h.deps,budget})).rejects.toMatchObject({code:'sec_unavailable'});
+  expect(h.calls).toEqual([]);expect(h.raw.objects.size).toBe(0);
+ });
+ it('maps HTTP errors and network failures to sec_unavailable and a CIK mismatch to invalid_schema',async()=>{
+  const code=async(p:Promise<unknown>)=>p.then(()=>null,(e:unknown)=>e instanceof SecSubmissionsError?e.code:'other');
+  expect(await code(fetchSubmissions('999001',harness({[MAIN_URL]:()=>new Response('nope',{status:404})}).deps))).toBe('sec_unavailable');
+  expect(await code(fetchSubmissions('999001',harness({}).deps))).toBe('sec_unavailable');
+  expect(await code(fetchSubmissions('999002',harness({'https://data.sec.gov/submissions/CIK0000999002.json':json(MAIN)}).deps))).toBe('invalid_schema');
+ });
+});
+
+describe('submissionsEvidenceClaims',()=>{
+ it('files one evidence_only claim per 8-A/25 filing, citing the document that lists it, with no security or date prefilled',async()=>{
+  const h=harness({[MAIN_URL]:json(MAIN),[PAGE_URL]:json(PAGE)});
+  const s=await fetchSubmissions('999001',h.deps,{coverFrom:'1993-01-01'});
+  const claims=submissionsEvidenceClaims(ISSUER,s,'2026-11-05');
+  expect(claims.map(c=>[c.op,c.id_type,c.value,c.source])).toEqual([['evidence_only','ticker','0000999001-25-000031','sec_submissions'],['evidence_only','ticker','0000999001-01-000001','sec_submissions']]);
+  expect(claims[0].detail).toEqual({schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:ISSUER},
+   params:{suggested_op:'close_security',accession:'0000999001-25-000031',form:'25-NSE',filing_date:'2025-09-12',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
+   evidence:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:sha(MAIN),locator:'filings.recent[1]',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
+   sources:[claims[0].detail.evidence]});
+  expect(claims[1].detail.params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
+  expect(claims[1].detail.evidence.evidence_sha256).toBe(sha(PAGE));
+  expect(claims[1].detail.evidence.locator).toBe('CIK0000999001-submissions-001.json[1]');
+  // locators and evidence must pass the public-provenance guards (no '?', '#', key=/token: text)
+  for(const c of claims)expect(()=>sanitizeProvenance({valid_from:c.detail.evidence},['valid_from'])).not.toThrow();
+ });
+});
diff --git a/src/lib/entities/identifiers/sec-submissions.ts b/src/lib/entities/identifiers/sec-submissions.ts
new file mode 100644
index 0000000..2470574
--- /dev/null
+++ b/src/lib/entities/identifiers/sec-submissions.ts
@@ -0,0 +1,177 @@
+// src/lib/entities/identifiers/sec-submissions.ts
+// SEC submissions (spec §4.3.3; reused by acceptance times §4.5 and the filing calendar §6.1).
+// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
+// User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
+// main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
+// merged snapshot. Parsers are pure and strict about the columnar `filings.recent` shape (every
+// column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
+// never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
+import type {Budget} from '../../facts/types';
+import {PacerError,createPacer} from '../../facts/providers/shared';
+import type {RawStore} from '../../dq/raw-store';
+import {normalizeCik} from '../../research/entity-keys/identifiers';
+import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
+import type {ClaimInput} from '../claims';
+import type {ClaimEvidence} from '../types';
+
+export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
+export const SEC_MIN_INTERVAL_MS=120;
+export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
+const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
+export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;
+
+export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string;index:number}
+export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
+export interface FormerName{name:string;from:string|null;to:string|null}
+export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
+export interface StoredDoc{name:string;sha256:string;path:string}
+export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
+export class SecSubmissionsError extends Error{
+ constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
+}
+export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';
+
+/** Acceleration named in submissions `category` (reference only; deadlines use the 10-K cover, spec §6.1). Only "Smaller reporting company" → unknown. */
+export function submissionsCategory(raw:string|null|undefined):FilerAcceleration{
+ const s=(raw??'').toLowerCase();
+ if(s.includes('non-accelerated'))return 'non_accelerated';
+ if(s.includes('large accelerated'))return 'large_accelerated';
+ if(s.includes('accelerated filer'))return 'accelerated';
+ return 'unknown';
+}
+
+const text=(v:unknown)=>typeof v==='string'&&v.trim()!==''?v:null;
+const invalid=(detail:string)=>new SecSubmissionsError('invalid_schema',detail);
+
+function columnar(o:unknown,page:string):SubmissionFiling[]{
+ if(!o||typeof o!=='object'||Array.isArray(o))throw invalid(`${page}: not an object`);
+ const c=o as Record<string,unknown>;
+ const acc=c.accessionNumber;
+ if(!Array.isArray(acc))throw invalid(`${page}: accessionNumber`);
+ const col=(k:string,required:boolean):unknown[]|null=>{
+  const v=c[k];
+  if(v===undefined&&!required)return null;
+  if(!Array.isArray(v)||v.length!==acc.length)throw invalid(`${page}: ${k}`);
+  return v;
+ };
+ const fd=col('filingDate',true)!,form=col('form',true)!;
+ const rd=col('reportDate',false),ad=col('acceptanceDateTime',false),pd=col('primaryDocument',false),ix=col('isInlineXBRL',false);
+ return acc.map((a,i)=>{
+  if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
+  const x=ix?.[i];
+  return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
+   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page,index:i};
+ });
+}
+const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};
+
+export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}
+
+export function parseSubmissions(json:string):ParsedSubmissions{
+ const doc=parseJson(json,'main');
+ if(!doc||typeof doc!=='object'||Array.isArray(doc))throw invalid('main: not an object');
+ const d=doc as Record<string,unknown>;
+ let cik:string;
+ try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
+ const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
+ if(!filings||typeof filings!=='object')throw invalid('filings');
+ const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
+ const fye=text(d.fiscalYearEnd);
+ return {
+  cik,name:text(d.name),category:text(d.category),
+  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
+  tickers:strings(d.tickers).map(t=>t.trim().toUpperCase()),exchanges:strings(d.exchanges),
+  formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
+   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
+   return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
+  }),
+  filings:columnar(filings.recent,'recent'),
+  files:(Array.isArray(filings.files)?filings.files:[]).map(f=>{
+   const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
+   if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
+   return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
+  }),
+ };
+}
+
+export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget}
+
+const FETCH_TIMEOUT_MS=30_000;
+const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});
+
+export function submissionsClient(deps:FetchSubmissionsDeps){
+ const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
+ const clock=deps.clock??(()=>new Date());
+ const budget=deps.budget??unlimited();
+ const pacer=createPacer(SEC_MIN_INTERVAL_MS);   // one pacer per client: >= 120 ms between its requests
+ // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
+ const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
+  try{
+   await pacer.admit({budget,reserveMs:0,now:deps.now,sleep:deps.sleep as never});
+  }catch(e){
+   if(e instanceof PacerError)throw new SecSubmissionsError('sec_unavailable',`${name}: ${e.code}`);
+   throw e;
+  }
+  let res:Response;
+  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
+  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
+  let bytes:Uint8Array;
+  try{bytes=new Uint8Array(await res.arrayBuffer());}
+  catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
+  const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
+  if(!res.ok){
+   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported.
+   try{await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
+   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
+   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`);
+  }
+  const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
+  return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
+ };
+ return {
+  /** coverFrom: also fetch every files[] page whose filingTo >= coverFrom ('YYYY-MM-DD'); null/undefined: main document only. */
+  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
+   const c=normalizeCik(cik);
+   const fetchedAt=clock().toISOString();
+   const main=await get(submissionsUrl(c),c,'main');
+   const parsed=parseSubmissions(new TextDecoder().decode(main.bytes));
+   if(parsed.cik!==c)throw invalid(`cik ${parsed.cik} != ${c}`);
+   const from=opts.coverFrom??null;
+   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
+   const pages:StoredDoc[]=[];
+   const filings=[...parsed.filings];
+   const seen=new Set(filings.map(f=>f.accessionNumber));
+   for(const f of wanted){
+    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
+    pages.push(p.doc);
+    for(const x of parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
+   }
+   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
+  },
+ };
+}
+
+export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
+export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
+
+export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
+ '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
+ '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
+ '25':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
+ '25-NSE':{suggested_op:'close_security',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
+};
+
+/** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
+export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
+ const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
+ return snap.parsed.filings.flatMap(f=>{
+  const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
+  const sha=rule?shaOf(f.page):null;
+  if(!rule||!sha)return [];
+  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page==='recent'?'filings.recent':f.page}[${f.index}]`,note:rule.note};
+  return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
+   schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
+   params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
+  }}];
+ });
+}
diff --git a/src/lib/entities/submissions-evidence.test.ts b/src/lib/entities/submissions-evidence.test.ts
new file mode 100644
index 0000000..6e75782
--- /dev/null
+++ b/src/lib/entities/submissions-evidence.test.ts
@@ -0,0 +1,44 @@
+// src/lib/entities/submissions-evidence.test.ts
+import {readFileSync} from 'node:fs';
+import {describe,it,expect} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import {memoryRawStore} from '../dq/raw-store';
+import {fetchSubmissions} from './identifiers/sec-submissions';
+import {applySubmissionsEvidence} from './submissions-evidence';
+
+const MAIN=readFileSync(new URL('./fixtures/sec-submissions/zz-main.json',import.meta.url),'utf8');
+const PAGE=readFileSync(new URL('./fixtures/sec-submissions/zz-page-001.json',import.meta.url),'utf8');
+const ISSUER='10000000-0000-4000-8000-000000000009',OTHER='10000000-0000-4000-8000-00000000000a';
+const BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.sec-submissions';
+const fetch=(async(u:string|URL|Request)=>new Response(String(u).endsWith('-001.json')?PAGE:MAIN,{status:200})) as typeof globalThis.fetch;
+const snapshot=()=>fetchSubmissions('999001',{fetch,raw:memoryRawStore(),sleep:async()=>{}},{coverFrom:'1993-01-01'});
+const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{},...o});
+const client=()=>memoryTableClient({security_aliases:['alias','ticker','alias_type'],issuer_identifier_claims:['id'],dq_quarantine:['id']});
+
+describe('applySubmissionsEvidence',()=>{
+ it('writes former-name aliases on the primary row, evidence claims and SEC-only tickers; a replay changes nothing',async()=>{
+  const c=client();
+  await c.insert('issuer_securities',sec(ISSUER,'ZZF'));
+  const input={issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF','ZZFX'])};
+  const first=await applySubmissionsEvidence(c,input);
+  expect(c.rows('security_aliases')).toEqual([expect.objectContaining({alias:'ZZ Fixture Corp',ticker:'ZZF',alias_type:'name',source:'sec_submissions'})]);
+  expect(c.rows('issuer_identifier_claims').map(r=>[r.op,r.value])).toEqual([['evidence_only','0000999001-25-000031'],['evidence_only','0000999001-01-000001']]);
+  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')).toMatchObject({issuer_id:ISSUER,valid_from:'2026-11-05',valid_from_method:'first_observed',source:'sec_submissions',share_class:'unknown',is_primary:false});
+  expect(first.counts).toMatchObject({inserted:2,failed:0});
+  expect(first.claims).toEqual({evidence_only:2});
+  const again=await applySubmissionsEvidence(c,input);
+  expect(again.counts).toMatchObject({inserted:0,duplicates:2,failed:0});
+  expect(again.claims).toEqual({evidence_only_appended:2});
+  expect(c.rows('issuer_identifier_claims')).toHaveLength(2);
+ });
+ it('quarantines an SEC ticker held by another issuer and skips tickers outside the universe',async()=>{
+  const c=client();
+  await c.insert('issuer_securities',sec(OTHER,'ZZFX'));
+  const res=await applySubmissionsEvidence(c,{issuerId:ISSUER,primaryTicker:null,snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZFX'])});
+  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,natural_key:'ZZFX:2026-11-05',reason_code:'ownership_conflict'})]);
+  expect(c.rows('security_aliases')).toEqual([]);
+  expect(res.skippedSummary).toEqual({no_primary_ticker:1});
+  const none=await applySubmissionsEvidence(client(),{issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF'])});
+  expect(none.skippedSummary).toEqual({ticker_not_in_universe:1});
+ });
+});
diff --git a/src/lib/entities/submissions-evidence.ts b/src/lib/entities/submissions-evidence.ts
new file mode 100644
index 0000000..feb04f8
--- /dev/null
+++ b/src/lib/entities/submissions-evidence.ts
@@ -0,0 +1,51 @@
+// src/lib/entities/submissions-evidence.ts
+// Writes the identity evidence of one SEC submissions snapshot (spec §4.3.3): formerNames as
+// security_aliases on the issuer's primary row, 8-A/25 filings as evidence_only claims, and
+// tickers[] that SEC lists but this database does not hold as first_observed rows (only tickers in
+// stocks_universe; a ticker held by another issuer is quarantined as ownership_conflict). Tickers
+// this database holds but SEC no longer lists are handled by load-sec ticker-change detection.
+import type {TableClient} from '../db/table-client';
+import {emptyCounts,type BatchError} from '../dq/batches';
+import {normalizeSecurityTicker} from '../securities/ticker';
+import {fileClaim,isUnique} from './claims';
+import {submissionsEvidenceClaims,type SubmissionsSnapshot} from './identifiers/sec-submissions';
+import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
+import {attachSecurity} from './securities';
+
+export interface SubmissionsApplyInput{issuerId:string;primaryTicker:string|null;snapshot:SubmissionsSnapshot;asOf:string;batchId:string;dataset:string;universe:ReadonlySet<string>}
+
+export async function applySubmissionsEvidence(tables:TableClient,input:SubmissionsApplyInput):Promise<ApplyResult&{claims:Record<string,number>}>{
+ const counts=emptyCounts();const errors:BatchError[]=[];
+ const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
+ const skip=(k:string)=>{skippedSummary[k]=(skippedSummary[k]??0)+1;};
+ const names=input.snapshot.parsed.formerNames;
+ if(input.primaryTicker){
+  for(const f of names){
+   try{
+    await tables.insert('security_aliases',{alias:f.name,ticker:input.primaryTicker,alias_type:'name',source:'sec_submissions',created_at:new Date().toISOString()});
+    counts.inserted++;
+   }catch(e){if(isUnique(e))counts.duplicates++;else{counts.failed++;errors.push({code:'alias_error',key:f.name,message:errorMessage(e)});}}
+  }
+ }else if(names.length)skip('no_primary_ticker');
+ for(const c of submissionsEvidenceClaims(input.issuerId,input.snapshot,input.asOf)){
+  try{const created=await fileClaim(tables,c);const k=created?'evidence_only':'evidence_only_appended';claims[k]=(claims[k]??0)+1;}
+  catch(e){counts.failed++;errors.push({code:'claim_error',key:c.value,message:errorMessage(e)});}
+ }
+ const held=new Set((await tables.select('issuer_securities',{issuer_id:input.issuerId,valid_to:null})).map(r=>String(r.ticker)));
+ for(const raw of input.snapshot.parsed.tickers){
+  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
+  if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
+  if(held.has(ticker)){counts.duplicates++;continue;}
+  try{
+   const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{valid_from:{source:'sec_submissions',as_of:input.asOf,evidence_sha256:input.snapshot.main.sha256}}});
+   if(res==='inserted')counts.inserted++;
+   else if(res==='duplicate')counts.duplicates++;
+   else await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode:'ownership_conflict',
+    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions'},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
+    counts,errors,{code:'ownership_conflict',key:ticker});
+  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
+ }
+ counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
+ const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
+ return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
+}

exec
/bin/zsh -lc 'cat src/lib/db/table-client.ts; cat src/lib/entities/securities.ts; cat src/lib/dq/batches.ts; cat src/lib/entities/claims.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
// src/lib/entities/securities.ts
// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
// Plan 3 (spec 3 §3.1, §4.2.1; contract C2): every inserted row carries valid_from_method /
// valid_to_method (defaults: curated source → 'curated', else 'first_observed'; a closed window must
// name its method), provenance passes the public whitelist (sanitizeProvenance) before any DB access,
// and an ISIN contradiction becomes a claim/1 claim when the caller supplies claimEvidence: a row of
// this issuer → set_identifier / correct_identifier on that row; another holder (open incoming window
// only) → attach_security for the incoming security. Closed-history conflicts are only reported.
import type {Row,TableClient} from '../db/table-client';
import {buildClaimDetail,fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import {sanitizeProvenance} from './provenance';
import type {IssuerSecurityInput,ValidFromMethod,ValidToMethod} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';
export const VALID_FROM_METHODS:readonly ValidFromMethod[]=['first_observed','listing_date','ticker_change','curated'];
export const VALID_TO_METHODS:readonly ValidToMethod[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

/** Window-end methods for an incoming row; throws invalid_security:<field> on a missing or unknown method. */
export function securityMethods(raw:Pick<IssuerSecurityInput,'source'|'valid_from_method'|'valid_to_method'>,validTo:string|null):{valid_from_method:ValidFromMethod;valid_to_method:ValidToMethod|null}{
 const from=raw.valid_from_method??(raw.source==='curated'?'curated':'first_observed');
 if(!VALID_FROM_METHODS.includes(from))throw new Error('invalid_security:valid_from_method');
 const to=raw.valid_to_method??null;
 if(validTo===null){
  if(to!==null)throw new Error('invalid_security:valid_to_method');
  return {valid_from_method:from,valid_to_method:null};
 }
 if(to===null||!VALID_TO_METHODS.includes(to))throw new Error('invalid_security:valid_to_method');
 return {valid_from_method:from,valid_to_method:to};
}

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 const methods=securityMethods(raw,sec.valid_to);
 const provenance=sanitizeProvenance(raw.provenance??{});
 /** ISIN claim against a row of this issuer: set when the row has none, correct when it differs. */
 const claimOnRow=async(row:Row)=>{
  if(!sec.isin||!raw.claimEvidence)return;
  const current=str(row.isin);
  const op=current===null?'set_identifier':'correct_identifier';
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source,op,
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id,ticker:sec.ticker,valid_from:String(row.valid_from)},
    params:current===null?{}:{expected_current:current,new_value:sec.isin},evidence:raw.claimEvidence.evidence})});
 };
 /** Another holder blocks the window: an open incoming window with an ISIN becomes attach_security. */
 const claimAttach=async(note?:string)=>{
  if(!sec.isin||!raw.claimEvidence||sec.valid_to!==null)return;
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'ticker',value:sec.ticker,source:sec.source,op:'attach_security',
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id},
    params:{share_class:sec.share_class,valid_from:sec.valid_from,valid_from_method:methods.valid_from_method,source:sec.source,isin:sec.isin,...(note?{note}:{})},evidence:raw.claimEvidence.evidence})});
 };
 /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
 const classify=async():Promise<AttachResult|null>=>{
  // A ticker has a handful of ownership rows at most; overlap is computed here, not in SQL.
  const rows=await client.select('issuer_securities',{ticker:sec.ticker},{orderBy:'valid_from'});
  const same=rows.find(r=>r.issuer_id===sec.issuer_id&&String(r.valid_from)===sec.valid_from);
  if(same){
   // Same primary key: a replay is a duplicate only if the window end and (when given) ISIN agree.
   // An absent incoming ISIN carries no information and never contradicts a stored one.
   const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
   if(isinDiffers)await claimOnRow(same);
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts an
  // overlapping row's ISIN (an absent incoming ISIN never contradicts).
  if(hit.every(r=>r.issuer_id===sec.issuer_id)){
   const differing=sec.isin===null?undefined:hit.find(r=>r.isin!==sec.isin);
   if(!differing)return 'duplicate';
   await claimOnRow(differing);
   return 'conflict';
  }
  await claimAttach();
  return 'conflict';
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
   valid_from_method:methods.valid_from_method,valid_to_method:methods.valid_to_method,source:sec.source,provenance,
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
  // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap')))){
   await claimAttach('isin_held_by_other_ticker');
   return 'conflict';
  }
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
 }
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

exec
/bin/zsh -lc "sed -n '72,84p' supabase/migrations/20260715130000_security_master_data.sql; sed -n '75,100p' src/lib/entities/load-sec.ts; rg -n 'remainingMs|timeout' src/lib/facts/providers/edgar.ts; cat src/lib/dq/raw-store.ts | head -135; rg -n '4.3.3|formerNames|SEC submissions' docs/spec* docs/plans* | head -40; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
create table public.security_aliases (
  alias text not null,
  ticker text not null references public.stocks_universe(ticker) on delete cascade,
  alias_type text not null
    check (alias_type in ('symbol','vendor','former_symbol','name','pinyin')),
  source text not null,
  created_at timestamptz not null default now(),
  primary key (alias, ticker, alias_type)
);

create index security_aliases_alias_idx on public.security_aliases (alias text_pattern_ops);
create index security_aliases_ticker_idx on public.security_aliases (ticker);

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
rg: src/lib/facts/providers/edgar.ts: IO error for operation on src/lib/facts/providers/edgar.ts: No such file or directory (os error 2)
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
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo'];
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
zsh:1: no matches found: docs/spec*

exec
/bin/zsh -lc "rg -l '4.3.3|formerNames' docs | head -20; rg -n 'AbortSignal.timeout|remainingMs' src/lib/entities/identifiers/*.ts; find . -name 'AGENTS*' -not -path './node_modules/*' -not -path './.git/*'; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 69ms:
docs/handoffs/alpha-s7/evidence/opus55-inputs.json
docs/audits/2026-11-04-evals-gold-sets/index.json
docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md
docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md
docs/handoffs/alpha-s6/evidence/opus55-inputs.json
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md
docs/handoffs/alpha-s6/evidence/opus55-round3-inputs.json
docs/audits/2026-11-04-data-foundation-3/03-disposition.md
docs/handoffs/alpha-s6/evidence/validation.json
docs/handoffs/alpha-s6/evidence/continuation/validation.json
docs/audits/2026-11-04-data-foundation-3/01-codex-round1.md
docs/handoffs/alpha-s6/evidence/continuation/opus55-final-inputs.json
docs/handoffs/alpha-s6/evidence/opus55-round2-inputs.json
docs/audits/2026-11-04-data-foundation-3/04-codex-round3.md
docs/audits/2026-11-05-data-foundation-3/verification.md
docs/handoffs/alpha-s6/evidence/s5-node22-tests.log
docs/audits/2026-11-04-data-foundation-2/16-implementation-log.md
docs/audits/2026-11-05-data-foundation-3/codex/5a-review.md
docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md
docs/audits/2026-11-05-data-foundation-3/codex/1b-review.md
src/lib/entities/identifiers/sec-submissions.ts:100:const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});
src/lib/entities/identifiers/sec-submissions.ts:116:  try{res=await deps.fetch(url,{headers:{'User-Agent':ua,Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(FETCH_TIMEOUT_MS)])});}
src/lib/entities/identifiers/openfigi.test.ts:196: const budgetOf=(ms:number,signal=new AbortController().signal)=>({remainingMs:()=>ms,signal});
src/lib/entities/identifiers/openfigi.test.ts:249:  const a=await mapJobs([{idType:'ID_ISIN',idValue:'A'}],{...h.deps,budget:{remainingMs:()=>BACKOFF_MS+500,signal:new AbortController().signal},reserveMs:1000});
src/lib/entities/identifiers/openfigi.ts:78:const NO_LIMIT:Budget={remainingMs:()=>Infinity,signal:new AbortController().signal};
src/lib/entities/identifiers/openfigi.ts:102:  if(budget.remainingMs()-gap<=reserveMs)return false;
src/lib/entities/identifiers/openfigi.ts:147:   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
src/lib/entities/identifiers/sec-submissions.test.ts:100:  const budget={remainingMs:()=>60_000,signal:ctl.signal};
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-puAWreln' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-9Ei5XpYW' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md

exec
/bin/zsh -lc "rg -n -A32 -B4 '4.3.3|formerNames' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md; sed -n '105,140p' src/lib/entities/identifiers/openfigi.ts; cat package.json | head -40; cat vitest.config.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
37-- 全市场（`a_stock`、`hk_main`）发行人装载：本规格只补全已存在的发行人与证券行。A 股黄金集规模 N 由范围内 A 股发行人数决定（§5.4）。
38-- 港股财务事实与港股对账（F3）；巨潮 PDF 机器抽取（F3）。
39-- 任何面向用户的页面；只改 `/admin/dq`。
40-- 规格二 `same_day_conflict` 的选定；`odd_duration`、`missing_available_date` 的人工选定（继续只能确认知晓）。
41:- 美股 ticker 的上市日：SEC 数据不含；8-A/25 只作证据项（§4.3.3）。
42-- 40-F 法定期限（随加拿大期限，无输入）；仅 SRC 字样、无加速类别的申报人期限（Rule 12b-2 下 SRC 可同时为加速申报人，无法从 SRC 字样推出期限）。
43-- 发行人合并前的证券关闭/转移工具：仍按 runbook §1.1 手工；本规格只提供拓扑写入函数（`set_merge` 含引用方改指、`set_dissolved`）并用触发器封死其他路径（§3.1/§3.2）。
44-- 对账右侧的来源不确定性建模：右侧（年报印刷值、iXBRL 标注值）按其印刷/标注精度建区间，左侧按十进制原文精确；不再进一步建模。
45-
46----
47-
48-## 2. 现状（2026-11-04 仓库勘察事实）
49-
50-| 领域 | 现状 | 本规格如何使用 |
51-|---|---|---|
52-| 证券行 | `issuer_securities(issuer_id, ticker, isin, figi, share_class, is_primary, valid_from, valid_to, source, provenance)`；`valid_from` 由 `load-sec.ts` 写为运行日、由 `link-research.ts` 从 `first-cohort.json` 带入（自述"unverified"），`valid_to` 同样可由该文件带入；FIGI 从未写入；`IssuerSecurityInput` 无方法字段，`attachSecurity` 显式构造 insert 行；互斥约束 `issuer_securities_no_overlap`、`issuer_securities_isin_no_overlap` | 新列、类型与 `attachSecurity` 一起改（F3-0） |
53-| 发行人 | `upsertIssuerByIdentifiers` 以硬标识符归并；守卫更新只写 `status='active'` 且列为空的行 | 声明接受复用同样的守卫条件（§3.1 函数） |
54-| 声明表 | `issuer_identifier_claims(id_type, value, source, confidence not null, status)`，部分唯一索引 `(issuer_id,id_type,value) where pending`；`fileClaim` 固定 `confidence:0.5`；runbook §4 允许过用 SQL 处理（无 `resolved_at`） | 加列、重建索引、新约束对旧行成立 |
55-| 解析 | `resolveIssuer(client, q, {includeExpired, today})` | `asOf` 作为正式参数名 |
56-| 上市日期 | `stocks_universe.list_date/delist_date/source/source_updated_at`：A 股 Tushare `stock_basic`、港股 `hk_basic`（上游交易所）；美股 Nasdaq 目录无上市日 | A/H 证据；值复制进 provenance |
57:| SEC submissions | `edgar-submissions-1321655.json` 顶层 `category`、`fiscalYearEnd`、`formerNames`、`tickers`、`exchanges`，`filings.recent.{accessionNumber, filingDate, reportDate, acceptanceDateTime, form, primaryDocument, isInlineXBRL}`，`filings.files=[]`（分页未由夹具覆盖） | 受理时刻、档案、上游申报、换码第二来源 |
58-| 10-K 正文 | `primaryDocumentUrl`、`htmlToText`；正文自 2019 年起为内联 XBRL | 右侧解析 `ix:nonFraction` |
59-| 依赖 | `package.json` 有 `xlsx`；无 HTML/XML 解析库 | iXBRL 用自带有界 XML 分词器 |
60-| GLEIF / 巨潮 / Tushare | `parse-gleif-isin-lei.ts` 只打印；`fill-cninfo-org-id.ts` 只改 json；`fetchTushareDisclosureDate` 按 `end_date` 倒序，需 2000 积分 | 改写；按报告期精确匹配 |
61-| DQ | `dq_reconciliations` 无 `detail`、**无写入者、生产为空表**；`dq_freshness.expected_cadence` 枚举 daily/monthly/quarterly/event（`freshness.ts` 同）；`quarantine()` 同键 open 复用旧项；service_role 对 `dq_*` 有 update 权限；`batchStatusFromCounts` 六计数器 | 加列、加 `weekly` 节奏、每结果一个计数 |
62-| 事实层（落地计划二 = 规格二第 8 稿 + §16） | `fact_sync_scope.state_rev`；可见性函数持 scope 行锁；`read_facts(9 参数)` jsonb 信封、`p_include_non_ok`；`fact_state_rev()`；`resolve_facts_quarantine`、`promote_quarantined` 资格规则；`replace_financial_metrics(issuer, market, based_on_rev, rows)`；`filings_limited_update` 允许 `document_ref/document_url/link_attempts`（service_role 有这三列的列级 update，`updateFilingLink` 依赖）与 `mapping_gen`（只经函数、只增）；插入必须 `staged`；`abandoned` 运行才可删行；资格判定在内部助手 `fact_promote_rows(uuid,text,uuid[])`（`promote_quarantined` 与 `resolve_facts_quarantine` 都调用它）；`facts.*` 隔离项的 `dataset` 持久化为小写 `facts.us`/`facts.cn`（`sync.ts`）；`ambiguous_value` 的 `payload.candidates` 是 `FactCandidate`（camelCase：`filingRef/sourceConcept/periodStart/periodEnd/rawHash`，无 `mapping_gen/mapping_version`），`payload.run_id` 为锚定运行，代编码在 `natural_key` 末段；处理钩子在 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（`FACT_ROW_REASONS` 三项）与 `/api/admin/dq/quarantine/[id]` | 本规格新增函数、`fact_promote_rows` 的**附加**资格谓词（§3.2）、`resolveFactsItem` 的分派分支（§4.6、§5.6） |
63-| 环境 | 本机无 `TUSHARE_TOKEN`、`EDGAR_USER_AGENT`、`OPENFIGI_API_KEY` | §13 |
64-| 迁移 | 已锁至 `20261105091000`；规格二占 `20261106090000` | `20261107090000`、`20261107091000` |
65-
66----
67-
68-## 3. 数据模型
69-
70-两个迁移，可重放（**所有旧行回填只在新增列的那次执行**：用 `do $$ if not exists (select 1 from information_schema.columns …) then alter table … add column …; update …; end if $$` 包裹，重放不再触碰已写入的证据），补 `migrations.lock.json` 与 `database.types.ts`。第一个不依赖规格二；第二个在规格二迁移之后。`test:migrations` 在有数据的库上演练两次：第一次升级（含已关闭证券行、无 `resolved_at` 的已处理声明），写入新证据后第二次重放，断言证据未被改写。
71-
72-### 3.1 `20261107090000_identifiers_and_dq.sql`（不依赖规格二）
73-
74-**`issuer_securities`**
75-
76-```
77-valid_from_method  text not null default 'first_observed'
78-                   check (valid_from_method in ('first_observed','listing_date','ticker_change','curated'))
79-valid_to_method    text check (valid_to_method is null or valid_to_method in ('delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'))
80-constraint issuer_securities_to_method_iff_to check ((valid_to is null) = (valid_to_method is null))
81-```
82-
83-首次加列时回填：`source='curated'` → `valid_from_method='curated'`；`valid_to is not null` → `valid_to_method = case source when 'curated' then 'curated' else 'unrecorded' end`。`provenance` 允许键（写入端 `sanitizeProvenance` 白名单，集成测试断言含私密键/URL token/用户 ID 的对象被拒）：`isin:{source, as_of, evidence_sha256, locator}`、`figi:{source, as_of, evidence_sha256, job:{idType, idValue, exchCode?}, level}`、`valid_from:{source, provider, as_of, row:{list_date, source, source_updated_at}}`（复制所用源行值，不引用可变表）、`valid_to:{…, row:{delist_date,…}}`、`pending_change:{first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers, sources}`。
84-
85-**`issuer_identifier_claims`**
86-
87-```
88-drop index issuer_identifier_claims_pending_unique;
89-alter … drop constraint issuer_identifier_claims_id_type_check;
--
337-  - `list_date > valid_from` → 隔离 `window_evidence_conflict`，不改。
338-- `delist_date` 非空且行未关闭且本行是该 ticker 最晚的持有行 → `valid_to=delist_date, valid_to_method='delisting'`（provenance 同法）；`delist_date <= valid_from` → 隔离。
339-- 美股无 `list_date`：不回填。
340-
341:#### 4.3.3 美股：SEC submissions `src/lib/entities/identifiers/sec-submissions.ts`
342-
343-对范围内有 CIK 的发行人抓 submissions JSON（UA、120 ms 间隔；入桶；`filings.files[]` 的分页在需要时抓取并入桶——F3-4 第一步用一家申报超过 `recent` 容量的老公司实测结构并录夹具）。一次抓取服务五个消费者（受理时刻、档案、上游申报存在性、本节证据、换名）。
344-
345:- `formerNames` → `security_aliases(alias, ticker=主行, 'name', source='sec_submissions')`。
346-- `8-A12B`/`8-A12G`、`25`/`25-NSE`：写 **`evidence_only`** claim（`evidence_kind='filing_form'`，`target={issuer_id}`，`params={suggested_op:'backdate_window'|'close_security', accession, form, filing_date, note}`；8-A12G 注明"12(g) 注册，非交易所上市"；Form 25 注明"Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别"）。**不预填证券与日期**；审核人读原文后用 `p_amend` 指定证券行与生效日。
347-- `tickers[]`：SEC 有、本库无且在 `stocks_universe` → 挂接 `first_observed`；本库有、SEC 无 → §4.3.4 的第二来源。
348-
349-#### 4.3.4 换码检测（`load-sec.ts` 扩展）
350-
351-`load-sec --apply` 必须带 `--fetched-at <ISO>`（下载时刻，写入 `tool_versions`）与文件 sha256；`as_of` 与 `fetched_at` 都必须 ≥ 上一次成功批次的值（`stale_snapshot`）；文件数据行数 < 上一次的 90% → 拒绝（`incomplete_snapshot`）。对一个 CIK：
352-- 新 ticker → 新行 `first_observed`（既有）。
353-- 本库未关闭、`source='sec_company_tickers_exchange'` 的 ticker 在文件中对该 CIK 消失：
354-  - 首次：`provenance.pending_change={first_missing_as_of, first_missing_sha256, first_missing_fetched_at, replacement_tickers:[本次该 CIK 新增且 securityType 不明的 ticker], sources:['sec_company_tickers_exchange']}`，不关闭。
355-  - 再次出现 → 删除 `pending_change`。
356-  - 关闭条件（全部满足）：仍消失；`fetched_at − first_missing_fetched_at ≥ 7 天`；本次 sha256 ≠ 首次；**第二来源确认**：该 CIK 的 submissions `tickers[]`（本次运行抓取）不含 OLD。则 `valid_to = first_missing_as_of`，`valid_to_method = 'sec_file_absent'`（**观测界**：最后一次观测到持有是 `first_missing_as_of` 之前的那次运行；不断言换码生效日），`provenance.valid_to` 记两次文件哈希、submissions 哈希与 `last_seen_as_of`；`replacement_tickers` 只保留在 `provenance.pending_change`，并为该发行人写一条 `evidence_only` claim（`params.suggested_op='backdate_window'`，`note='观测到 OLD 消失、NEW 出现；换码生效日需 8-K/公告证据'`），由人工把 NEW 行改为 `ticker_change` 并给出生效日。
357-  - 该 ticker 在文件中归另一 CIK → `ownership_conflict` 隔离，不关闭。
358-  - 关闭后再次出现 → 新行 `first_observed`（从再出现的 `as_of` 起）；旧关闭行不改。
359-- 换码夹具：T0（CIK X 持 OLD）、T1（X 持 NEW，OLD 消失，`as_of=T0+1d`）、T2（仍无 OLD，`as_of=T0+8d`，不同 sha256，submissions 夹具 `tickers=['NEW']`）。断言：`resolveIssuer({ticker:'OLD'},{asOf:T0})` = X；T1 后 T2 前 `{asOf:T1}` = X；T2 后 `{asOf:T1}` = null、`{asOf:T0}` = X；OLD 行 `valid_to_method='sec_file_absent'`、NEW 行仍 `first_observed`、存在一条 `evidence_only` claim；缺少 submissions 确认时不关闭。
360-
361-#### 4.3.5 `resolveIssuer` 的 `asOf`
362-
363-`ResolveOptions{includeExpired?, asOf?, today?}` 同义；都给且不等 → `invalid_as_of`；`today` 标 `@deprecated`。`ResolvedSecurity` 加 `valid_from_method/valid_to_method`。`GET /api/entities/resolve?ticker=…&asOf=`：`asOf` ≤ 今天否则 400；历史 `asOf` 缓存 `public, max-age=600, s-maxage=3600`。规格二读接口加 `tickerAsOf`（有则按其解析，无则今天）；响应 `resolution:{tickerAsOf, issuerId, validFromMethod}`。
364-
365-### 4.4 合并后发行人的事实归属（读时谱系）
366-
367-- 谱系 = `{T} ∪ {i | i.merged_into = T}`（一跳）。事实行保留原 `issuer_id`。读取用 `read_facts_lineage`；跨发行人同 K 同日不同值的 `ok` 行不参与当前值、进 `conflicts`。
368-- 拓扑写入只经 `set_merge`/`set_dissolved`（§3.2；触发器 `issuers_topology_guard` 挡住其他路径）：持源、目标与两者全部引用方的 scope 锁、改指引用方、递增 `state_rev`、登记谱系对账成员。
369-- 冲突处置：对账对 `facts.lineage_same_day`（游标：合并时登记 + 每周）对每个 `conflicts` 条目写对账行（`kind='numeric'`，`outcome='compared'`，`passed=false`）并建隔离项 `lineage_conflict`（`natural_key=<T>:<K>:<available_date>`，`payload={fact_ids, values:[{issuer_id, filing, value}]}`）。管理员 POST 体 `keep_fact_id` → `resolve_lineage_conflict`（原子、排序锁、结束后恰一个 `ok` 值、裁决持久化并被 `promote_quarantined` 附加条款遵守）。不自动择一。
370-- `fact_sync_scope`：`merged` 发行人 `priority=0`、`reasons=[]`。
371-- 物化目标：对发行人 i 的任何可见性操作（发布、提升、对账隔离、采用候选、谱系裁决、恢复）后，物化 `T(i) = i.merged_into ?? i`。**扩展落地的 `materialize(db, issuer, market, opts)` 契约（T9）**：读 T 的当前谱系 → `readFactsLineage(lineage, market, …)`（`truncated` → 拒绝，不写）→ 校验每行 `issuer_id ∈ 谱系`（替代落地的"行必须属于本发行人"检查）→ 为 T 派生 → `replaceMetricsLineage(T, market, state_revs, rows)`；`stale_computation` → 重读重算一次（保留落地的一次重试）。
372-- 读接口：`issuerId`=T，`lineage`，`conflicts`，每行 `recordedIssuerId`。**`/metrics` 无 `asOf`（T8 规定修法，保留落地的前后两次读取守卫）**：读指标前后各读一次谱系成员与 `stateRevs(lineage)`；两次的成员与 rev 向量必须相同，且每个返回行的 `based_on_lineage` 等于该向量；任何不一致或读取不稳定 → `metrics:[]`、`stale:true`，沿用落地的 stale 缓存策略（`STALE_CACHE_CONTROL`）；不内联重算（由上述操作路径重算）。
373-
374-### 4.5 SEC 受理时刻 `src/lib/facts/providers/sec-acceptance.ts`
375-
376:规格二美股路第 9 步后加 9b `enrichAcceptance(issuer)`；脚本 `scripts/facts/enrich-acceptance.ts [--issuer …] [--apply] [--report]`。用 §4.3.3 同一份 submissions；按 `accessionNumber` 索引（含分页）；`accepted_at is null` 的 edgar filing 逐个 `set_filing_acceptance`；未命中 → `skipped_summary(acceptance_not_found)`。`filingDate ≠ available_date` → 对账对 `sec.filing_date_vs_submissions`（`kind='date'`，failed），不写。计数：写入 `inserted`，相同 `duplicates`，`acceptance_conflict` → `failed`。
377-
378-### 4.6 被隔离候选的人工选定（`ambiguous_value`）
379-
380-规格二 §7.3 规定 `facts.*` 项的接受全部经 `resolve_facts_quarantine`。**落地的分派点是 `src/lib/dq/facts-resolver.ts::resolveFactsItem`（由 `/api/admin/dq/quarantine/[id]` 调用），本规格扩展它（T10 规定修法）**，接受分支：`ambiguous_value` 带 `chosen_candidate_index` → `adopt_candidate`；`reconcile_mismatch` → `restore_reconciled`；`lineage_conflict` 带 `keep_fact_id` → `resolve_lineage_conflict`；`reconcile_review` → 计划一通用的守卫状态翻转（接受与拒绝都只改状态，不提升、不物化）；其余 `facts.*` 原因 → 落地路径（`resolve_facts_quarantine`）。拒绝分支保持落地的通用翻转（行保持 `quarantined`）。保留落地语义：持久化的 `chosen_fact_ids`、持久化的裁决人归属（`recovered`）、失败重试的 HTTP 502。**每个新的可见性变化裁决**（`adopt_candidate`、`restore_reconciled`、`resolve_lineage_conflict`）都在其 SQL 函数的同一事务内写 `detail.hook={stage:'materialize', state:'pending', at}` 与物化目标（`detail.issuer_id/market`）；恢复按持久化的目标与裁决处理缺失/pending/failed 钩子（`FACT_ROW_REASONS` 扩展为包含这三个原因的恢复判定）。新增 `scripts/facts/materialize.ts --pending-hooks`（落地脚本目前没有该参数）：扫描 (a) 全部 `facts.*` **已处理**项中 `hook.state ∈ {pending, failed}` 或缺失钩子的可见性裁决（采用、恢复、谱系），以及 (b) **open** 的 `reconcile_mismatch` 项中 `hook.state ∈ {pending, failed}` 者（对账隔离，项在人工处理前一直 open）；按项上持久化的 `detail.issuer_id/market` 取发行人，恢复时按当前拓扑重新求物化目标 `T(i)`（U2）。测试：`apply_reconcile_result` 提交后立即崩溃、项仍 open → 扫描完成物化。分派表与其测试必须穷举以上分支。
381-
382-- 路由：读项与候选 → 由候选 `filingRef` 经新增的 `FactsDb.findFilingBySourceRef(source, sourceRef)`（`source` 由项市场决定）定位 filing，取其 `issuer_id/market`（不信任 payload）→ `readFacts(issuer, market, {concepts: 该组, asOf: 今天, includeNonOk:false})` 得 `stateRev` 与该组当前代 `ok` 行 → TS 评估规格二 §7 规则（候选 ∪ ok 行）；失败 → 400 `rule_failed`，不写库 → 新建批次（`producer='dq-resolver'`，`dataset = 项.dataset`）→ `adoptCandidate(item, n, batch, stateRev, resolvedBy)`：`stale_evaluation` → 重读重评一次再调用，仍过期 → 409；`batch_mismatch` 为编程错误 → 500；`replay_required`/`filing_not_found` → 409；其余码按 §8。
383-- 函数在同一事务写入 `detail.hook={stage:'materialize', state:'pending'}`；路由随后 `materialize(T(issuer), market)`，成功改 `{stage:'done', state:'done'}`，失败 `{stage:'materialize', state:'failed', message}`。重试：项已 `resolved_accept` 且 `detail.adopted_fact_id` 存在 → 只做物化。崩溃于函数提交与物化之间 → 项上 `hook.state='pending'` 可被重试与 `scripts/facts/materialize.ts --pending-hooks` 扫到。
384-- 审计日志 `detail` 加索引与 `adopted_fact_id`。未带索引的接受仍是确认知晓（规格二路径）。
385-
386----
387-
388-## 5. F5 跨来源对账
389-
390-### 5.1 对账对登记 `src/lib/dq/reconcile/pairs.ts`
391-
392-```ts
393-export interface ReconcilePair { id: ReconcilePairId; kind: 'numeric'|'text'|'date'; left: string; right: string;
394-  expectedKeys: (ctx) => Promise<ExpectedKey[]>; tolerance: (row) => Decimal; onFail: 'quarantine_left'|'claim'|'record'|'lineage_item' }
395-```
396-
397-| pair | kind | left / right | natural_key | 容差 | 失败动作 |
398-|---|---|---|---|---|---|
399-| `us.companyfacts_vs_ixbrl` | numeric | 清单自然键解析到的本地事实（`ok` 或 `quarantined`）/ 同 accn 主文档 `ix:nonFraction` | `<cik>:<accn>:<concept>:<period_start>:<period_end>:<unit>` | 0 | 隔离左侧（仅 `ok`） |
400-| `cn.tushare_vs_cninfo_pdf_gold` | numeric | 黄金行绑定的披露（§5.4）/ 黄金行 | `<ticker>:<fy>:<concept>:<report_type>` | 印刷精度区间 | 隔离左侧 |
401-| `us.companyfacts_vs_gold` | numeric | 规格二 `plan2.json` 美股部分（只取非 `<pending>` 条目；`ready:false` 时每个 `<pending>` 条目一行 `incomplete_gold`，绝不比较占位值，也不宣称黄金完成，T15） | 同上 | 0 | 隔离左侧 |
402-| `sec.filing_date_vs_submissions` | date | `filings.available_date` / `filingDate` | `<cik>:<accn>` | 相等 | 记录 |
403-| `sec.filer_category` | text | submissions `category` / 主文档 `dei:EntityFilerCategory` | `<cik>:<accn>` | 相等 | 记录 |
404-| `entities.isin_hkex_vs_gleif` | text | HKEX ISIN / GLEIF+OpenFIGI ISIN | `<ticker>` | 相等 | claim |
405-| `facts.lineage_same_day` | numeric | 谱系 `conflicts` | `<T>:<K>:<available_date>` | 0 | `lineage_item` |
406-
407-数值比较全部精确十进制（`decimal.ts`：十进制字符串 → 缩放 `BigInt`，比较用交叉相乘，不做除法）。`rel_diff = |l−r| / max(|l|,|r|,1)`。**每个预期键恰一行**：`compared | left_missing | left_unlinked | left_ambiguous | right_missing | unsupported | right_ambiguous | incomplete_gold`（T1、T15）。
408-
 };
 /** The request is stored before it is sent; every received response is stored before anything else happens. */
 const send=async(body:string,reqSha:string):Promise<{res:Response|null;bytes:Uint8Array|null;sha:string|null}|'exhausted'>=>{
  // The horizon can move while this caller waits in the queue: recheck right before dispatch, then re-admit (keeps spacing).
  for(;;){
   if(!(await waitUntilUnblocked()))return 'exhausted';
   try{await limiter.pacer.admit({budget,reserveMs,now,sleep:wait,minIntervalMs});}
   catch(e){
    if(e instanceof PacerError)return e.code==='budget_exhausted'?'exhausted':(()=>{throw new OpenFigiError('budget_aborted');})();
    throw e;
   }
   if(limiter.blockedUntil-now()<=0)break;
  }
  requests++;
  let res:Response;
  try{res=await deps.fetch(OPENFIGI_URL,{method:'POST',headers,body,signal:budget.signal});}
  catch(e){
   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted',e instanceof Error?e.name:undefined);
   failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};
  }
  let bytes:Uint8Array;
  try{bytes=new Uint8Array(await res.arrayBuffer());}
  catch{
   if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
  }
  const stored=await store(bytes,{role:'response',request_sha256:reqSha,http_status:res.status});
  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
  return {res,bytes,sha:stored.sha256};
 };
 const retryable=(r:Response|null)=>r===null||r.status===429||r.status>=500;
 /** Every caller sharing the limiter backs off, not only this one. */
 const backoff=()=>{limiter.blockedUntil=Math.max(limiter.blockedUntil,now()+BACKOFF_MS);};
 for(let start=0;start<jobs.length;start+=jobsPerRequest){
  if(budget.signal.aborted)throw new OpenFigiError('budget_aborted');
  const chunk=jobs.slice(start,start+jobsPerRequest);
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
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

exec
/bin/zsh -lc "sed -n '280,309p' docs/superpowers/specs/2026-11-04-data-foundation-3-identifiers-and-reconciliation-design.md; rg -n 'Task 6a' docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md; node --version; ls node_modules/.bin/vitest; git diff 09b75c9 HEAD --stat" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
- 写入（`apply.ts`，目标行 `(issuer_id, ticker, valid_from)`）：列为空 → 守卫更新写值 + provenance；已有且相同 → 若 provenance 缺该键则只补 provenance（`duplicates`）；已有且不同 → claim `correct_identifier`（`params.expected_current=<旧值>`，`params.new_value`），不覆盖。ISIN 唯一/互斥冲突 → claim + 隔离 `ownership_conflict`。

#### 4.1.3 阶段 C · TICKER → FIGI

对仍无 FIGI 的未关闭行：job `{idType:'TICKER', idValue:<交易所内代码>, exchCode:<反查：US→'US'，.SH→'CG'，.SZ→'CS'，.HK→'HK'（去前导零）>}`；分组规则同 B；恰一组 → 写；多组 → claim；零 → `skipped_summary(figi_not_found)`。不产生 ISIN。

#### 4.1.4 阶段 D · HKEX（港股代码 → ISIN）

下载三份：`ListOfSecurities.xlsx`（`https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx`，通函 CT/118/25）、HKEX "Securities Lists" 页的 "ISINs assigned by HKEX" 与 "Other Numbering Agencies" 文件。以表头为准确定 ISIN 来源（优先第一份）；三者都无 → 港股 ISIN 只来自阶段 B，记 runbook。`xlsx` 解析为 (Stock Code, Name, Category, ISIN)。港股行 ISIN 以此为一手来源（`provenance.isin.source='hkex_<file>'`）；与阶段 B 不一致 → 对账对 `entities.isin_hkex_vs_gleif`（`kind='text'`）+ claim。

#### 4.1.5 A 股 ISIN 不推导

A 股 ISIN 的 NSIN 由中国境内的 ANNA 成员编码机构分配，与证券代码无函数关系（600519 → CNE0000018R8、000001 → CNE000000040）；美股 ISIN 可由 CUSIP 推导但本库无 CUSIP。无可推导的 ISIN；覆盖率按 E1 如实报告。规格一 §3.2 该行落地后标注"已撤回"。

#### 4.1.6 脚本改写

- `fill-identifiers.ts --gleif <csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]`。
- `fill-cninfo-org-id.ts`：读 `issuers`（`usci is not null and cninfo_org_id is null` 且持 `.SH/.SZ` 未关闭行），`resolveOrgId` 命中 → 守卫更新（`status='active' and cninfo_org_id is null`）；唯一索引冲突 → claim `set_identifier`（目标 `{issuer_id}`）。`first-cohort.json` 不再是写入目标。批次 `DATASETS.entities.cninfo`。

### 4.2 声明（claims）与 A+H 配对

#### 4.2.1 统一载荷 `claim/1`

`detail = {schema:'claim/1', evidence_kind, target, params, evidence:{source, as_of, evidence_sha256, locator?, note?}, sources:[…追加…], provenance_written?}`。`target_key` 列 = `op:` + 规范化 target（`issuer_id` 或 `issuer_id|ticker|valid_from`）。`claims.ts::validateClaimDetail(op, id_type, detail)` 在写入端校验，SQL 函数再校验一次（字段存在与类型）。

| `op` | `id_type` | `target` | `params` | 接受时（函数内静态 SQL；目标发行人必须 `active`；`row_count` 必须 = 1） |
|---|---|---|---|---|
| `set_identifier` | lei/cik/usci/cninfo_org_id | `{issuer_id}` | `{}` | `update issuers set <col>=value, provenance=provenance||{<col>:prov} where issuer_id and status='active' and <col> is null`；唯一冲突/0 行 → `value_conflict` |
| `set_identifier` | isin/figi | `{issuer_id, ticker, valid_from}` | `{}` | 对该证券行同样的空值守卫更新 + provenance |
| `correct_identifier` | 同上两组 | 同上 | `{expected_current, new_value}` | `where <col> = expected_current` 的守卫更新；0 行 → `value_conflict`；`value` 列 = `new_value` |
70:src/lib/entities/identifiers/sec-submissions.ts  fetchSubmissions / parseSubmissions / submissionsEvidenceClaims（Task 6a）
306:跨 Part 的 SEC submissions 形状以 Task 6a 为准：`fetchSubmissions(cik, deps:{fetch, raw, userAgent?, budget?, …}, opts?:{coverFrom?})` → `SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages:StoredDoc[], parsed:ParsedSubmissions, complete}`，`parsed.filings` = `recent` + 已抓取的 `files[]` 分页（`primaryDocument`/`isInlineXBRL` 可为 null）。Task 12 读 `snap.main.sha256`、`snap.pages[].sha256`（按条目 `page` 取证据哈希）、`snap.parsed.filings`，并以 `coverFrom` = 最早待补 `available_date` − 7 天调用（计划审计 R3）；Task 17b/18 只经 `filer-categories.ts::submissionsView` 读它（接口对齐记录 #34）。
385:| 24 | `evidence_only` 声明的 `value`（B6） | 8-A/25 证据 = 申报 `accessionNumber`；换码观测 = 消失的旧 ticker | Task 6a、6b（原稿） |
395:| 34 | `SubmissionsSnapshot` 形状（C12、E3） | 以 Task 6a 为准（见骨架"各部分新增导出"段）。Task 12 改读 `snap.main.sha256`、`snap.parsed.filings`（`acceptanceIndex(entries:readonly SubmissionFiling[])`；~~不在 `recent` 的旧 filing → `acceptance_not_found`~~ **计划审计 R3 修订（#68）：以 `coverFrom` 抓取覆盖待补 filing 的历史分页**）；Task 17b/18 的 `submissionsView` 改为映射 `cik.padStart(10)`、`main.sha256`、`parsed.*`，所有 `fetchSubmissions` 调用补 `fetch` 依赖与 `coverFrom`（日历：`filingsWindowStart(today)`；类别脚本：4 年前 1 月 1 日） | Task 12 测试与实现；Task 17b `submissionsView` 与测试、`scripts/dq/filer-categories.ts`；Task 18b `calendar-deps.ts`、`scripts/dq/calendar-sync.ts` 与测试 |
429:| 68 | 历史 SEC 受理时刻永远抓不到（计划审计 R3） | `AcceptanceDeps.submissions(cik10, b, coverFrom)`；`enrichAcceptance` 以 `acceptanceCoverFrom(pending)`（最早待补 `available_date` − `ACCEPTANCE_COVER_MARGIN_DAYS=7`）调用；生产（Task 12 `deps.ts`、14c Step 3b）与脚本 `enrich-acceptance.ts` 都把它传给 `fetchSubmissions(…,{coverFrom})`；`AcceptanceEntry.page` 逐条保留，`pageSha256(snap,page)` 给日期不一致结果的右侧证据（历史页 → `document=<页名>`、该页 sha256） | Task 12 测试（调用参数、历史分页回归）与实现、`deps.ts`、脚本；Task 14c Step 3b (b)(c)；骨架 Task 6a 形状段；#34 标注 |
4127:| `src/lib/entities/identifiers/sec-submissions.ts`（6a；**Task 12、18 复用的稳定 API**） | `SEC_SUBMISSIONS_BASE`、`SEC_MIN_INTERVAL_MS=120`、`SUBMISSIONS_PARSER_VERSION='sec-submissions/1'`、`submissionsUrl(cik)`、`SubmissionFiling`、`SubmissionsPageRef`、`FormerName`、`ParsedSubmissions`、`StoredDoc`、`SubmissionsSnapshot`、`SecSubmissionsError{code:'sec_unavailable'|'invalid_schema'}`、`FilerAcceleration`、`submissionsCategory(raw)`、`parseSubmissions(json)`、`parseSubmissionsPage(json,name)`、`FetchSubmissionsDeps`、`submissionsClient(deps)`（`.fetch(cik,{coverFrom})`，同一客户端内 120 ms 间隔）、`fetchSubmissions(cik,deps,opts)`、`filingsByAccession(parsed)`、`EVIDENCE_FORMS`、`submissionsEvidenceClaims(issuerId,snapshot,asOf)` | 见 Task 6a 末尾"对 Task 12/18 的接口说明" |
6820:### Task 6a: SEC submissions 抓取与解析 `sec-submissions.ts`（UA、120 ms、分页、原始入桶）+ 证据写入 + 分页结构核对
6829:- Modify: `docs/audits/2026-11-05-data-foundation-3/verification.md`（追加 Task 6a 一节）
7359: * Verification helper for spec §14-9 (Task 6a Step 9): fetches one CIK's submissions including
7390:## Task 6a · SEC submissions 分页结构（规格 §4.3.3、§14-9；日期 <填>）
13537:// Task 6a shape: SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:{…, filings}, complete}
19470:// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
v26.5.0
node_modules/.bin/vitest
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-I4eU1ev6' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Afh7EVVx' (errno=Operation not permitted)

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/entities/identifiers/sec-submissions.test.ts src/lib/entities/submissions-evidence.test.ts --configLoader native --no-cache' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 63ms:
failed to load config from /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __dirname is not defined in ES module scope
    at file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts?fresh-import-nheq3tnlzpa=0,file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts:5:41
    at ModuleJob.run (node:internal/modules/esm/module_job:569:25)
    at async node:internal/modules/esm/loader:650:26
    at async Object.collect (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:301:13)
    at async nativeImportConfigFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37324:36)
    at async loadConfigFromFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async _createServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:24268:65)
    at async createViteServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:8902:17)
    at async createVitest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:14288:18)




codex
No actionable regressions were identified in the commit. Test execution was attempted but blocked by a configuration-loading error, so runtime verification remains incomplete.
No actionable regressions were identified in the commit. Test execution was attempted but blocked by a configuration-loading error, so runtime verification remains incomplete.

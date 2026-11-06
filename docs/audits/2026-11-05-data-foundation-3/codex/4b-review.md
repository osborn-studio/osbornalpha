OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1affd-5763-7242-98b4-24c6a6fa1fcf
--------
user
commit 2b9f900
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 2b9f900; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 262ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-DEQKPEGE' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-G1SGuB7g' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jCsWLjRX' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-9FjDbRRY' (errno=Operation not permitted)
2b9f900 feat(entities): fill-identifiers stages A-D driver, E1 coverage measurement, cninfo orgId fill against issuers with raw evidence
 scripts/entity-keys/coverage.ts           |  41 +++++++
 scripts/entity-keys/fill-cninfo-org-id.ts |  83 +++++++++----
 scripts/entity-keys/fill-identifiers.ts   | 197 ++++++++++++++++++++++++++++++
 src/lib/dq/raw-store.ts                   |   4 +-
 src/lib/entities/cninfo-org-id.test.ts    |  64 ++++++++++
 src/lib/entities/cninfo-org-id.ts         |  76 ++++++++++++
 src/lib/entities/coverage.test.ts         |  31 +++++
 src/lib/entities/coverage.ts              |  26 ++++
 8 files changed, 494 insertions(+), 28 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show 2b9f900 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-UfvlisL8' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PILrSNut' (errno=Operation not permitted)
commit 2b9f90057b6c604612a507c65defc407287ef303
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:32:45 2026 -0800

    feat(entities): fill-identifiers stages A-D driver, E1 coverage measurement, cninfo orgId fill against issuers with raw evidence
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/coverage.ts b/scripts/entity-keys/coverage.ts
new file mode 100644
index 0000000..6ed9f2f
--- /dev/null
+++ b/scripts/entity-keys/coverage.ts
@@ -0,0 +1,41 @@
+/**
+ * Success-criteria measurements (spec §1.1). Read-only.
+ *   npx tsx scripts/entity-keys/coverage.ts [--segment e1|all] [--out <file.md>]
+ * E1: FIGI/ISIN coverage of open security rows of US in-scope issuers (targets 95% / 90%).
+ * --out writes a markdown table (e.g. docs/audits/2026-11-05-data-foundation-3/e1-<date>.md).
+ */
+import {writeFileSync} from 'node:fs';
+import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {coverageE1,type E1Result} from '../../src/lib/entities/coverage';
+import {errorMessage} from '../../src/lib/entities/load-sec';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+function args(argv:string[]){
+ let segment='all',out:string|null=null;
+ for(let i=0;i<argv.length;i++){
+  if(argv[i]==='--segment')segment=argv[++i]??'';
+  else if(argv[i]==='--out')out=argv[++i]??null;
+  else{console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
+ }
+ if(!['e1','all'].includes(segment)||(argv.includes('--out')&&!out)){console.error('usage: coverage.ts [--segment e1|all] [--out <file.md>]');process.exit(2);}
+ return {segment,out};
+}
+const e1Markdown=(r:E1Result,at:string)=>[
+ `## E1 · 标识符覆盖（${at}）`,'','| 指标 | 分子 | 分母 | 百分比 | 目标 | 达标 |','|---|---|---|---|---|---|',
+ `| FIGI（美股范围发行人未关闭行） | ${r.figi.num} | ${r.figi.den} | ${r.figi.pct??'—'} | 95% | ${r.passes.figi?'是':'否'} |`,
+ `| ISIN（其中发行人有 LEI 的行） | ${r.isin.num} | ${r.isin.den} | ${r.isin.pct??'—'} | 90% | ${r.passes.isin?'是':'否'} |`,'',
+].join('\n');
+
+async function main(){
+ const {out}=args(process.argv.slice(2));
+ const tables=supabaseTableClient(getAdminSupabase());
+ const at=new Date().toISOString();
+ const e1=coverageE1({
+  scope:await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id'),
+  securities:await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'),
+  issuers:await selectAll(tables,'issuers',{},'issuer_id'),
+ });
+ console.log(JSON.stringify({at,e1},null,1));
+ if(out)writeFileSync(out,e1Markdown(e1,at));
+}
+main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
diff --git a/scripts/entity-keys/fill-cninfo-org-id.ts b/scripts/entity-keys/fill-cninfo-org-id.ts
index bf1c99d..8709173 100644
--- a/scripts/entity-keys/fill-cninfo-org-id.ts
+++ b/scripts/entity-keys/fill-cninfo-org-id.ts
@@ -1,31 +1,62 @@
 /**
- * WP-A4/A2: fill missing A-share cninfo orgIds in first-cohort.json from 巨潮 topSearch (public, exact code match).
- *   npx tsx scripts/entity-keys/fill-cninfo-org-id.ts [--write]
+ * Fill issuers.cninfo_org_id from 巨潮 topSearch (spec §4.1.6): active issuers with a USCI, no orgId
+ * and an open .SH/.SZ row; exact code match; one request every 600 ms.
+ *   npx tsx scripts/entity-keys/fill-cninfo-org-id.ts [--apply]
+ * Dry run (default): looks up and prints, writes nothing (no batch, no bucket). --apply records an
+ * ingest batch (dataset entities.cninfo), stores every topSearch response in reconcile-raw, writes
+ * guarded updates and files set_identifier claims on unique-index clashes.
+ * first-cohort.json is no longer a write target.
+ * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
  */
-import { readFileSync, writeFileSync } from 'node:fs';
-import { resolveOrgId, type OrgLookup } from '../../src/lib/research/ingest/collectors/cninfo';
-import { applyOrgIds } from '../../src/lib/research/ingest/collectors/fill-cninfo-org-id';
-import type { CohortCompany, CohortFile } from '../../src/lib/research/entity-keys/types';
+import {supabaseTableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
+import {cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from '../../src/lib/entities/cninfo-org-id';
+import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
+import {resolveOrgId} from '../../src/lib/research/ingest/collectors/cninfo';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
-const FILE = new URL('../../src/lib/research/entity-keys/first-cohort.json', import.meta.url);
+const DATASET=DATASETS.entities.cninfo;
+const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
 
-async function main() {
-  const file = JSON.parse(readFileSync(FILE, 'utf8')) as CohortFile;
-  const lookups: Record<string, OrgLookup> = {};
-  for (const c of file.companies as CohortCompany[]) {
-    if (c.home_market !== 'A' || c.keys.cninfo_org_id) continue;
-    const code = /^(\d{6})\./.exec(c.securities.find(s => s.is_primary)?.exchange_code ?? '')?.[1];
-    if (!code) continue;
-    const hit = await resolveOrgId(code, {});
-    if (hit) lookups[code] = hit;
-    console.log(`${code}: ${hit ? `${hit.orgId} (${hit.name})` : 'unresolved'}`);
-    await new Promise(r => setTimeout(r, 600));
-  }
-  const result = applyOrgIds(file.companies as CohortCompany[], lookups, new Date().toISOString().slice(0, 10));
-  console.log(`filled ${result.filled.length}, unresolved ${result.unresolved.length}${result.unresolved.length ? `: ${result.unresolved.join(' ')}` : ''}`);
-  if (process.argv.includes('--write')) {
-    writeFileSync(FILE, JSON.stringify({ ...file, companies: result.companies }, null, 1) + '\n');
-    console.log('first-cohort.json updated');
-  }
+/** resolveOrgId through a fetch that keeps the exact response bytes (evidence for reconcile-raw). */
+async function lookup(code:string):Promise<CninfoLookup>{
+ let bytes=new Uint8Array();
+ const tap=(async(url:string|URL|Request,init?:RequestInit)=>{
+  const res=await fetch(url,init);
+  bytes=new Uint8Array(await res.arrayBuffer());
+  return new Response(bytes,{status:res.status,statusText:res.statusText,headers:res.headers});
+ }) as typeof fetch;
+ const hit=await resolveOrgId(code,{fetch:tap});
+ return {hit:hit?{orgId:hit.orgId,name:hit.name}:null,bytes};
 }
-void main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
+
+async function main(){
+ const argv=process.argv.slice(2);
+ if(argv.some(a=>a!=='--apply')){console.error('usage: fill-cninfo-org-id.ts [--apply]');process.exit(2);}
+ const apply=argv.includes('--apply');
+ const admin=getAdminSupabase();
+ const tables=supabaseTableClient(admin);
+ const asOf=new Date().toISOString().slice(0,10);
+ const targets=await cninfoTargets(tables);
+ if(!apply){
+  const res=await fillCninfoOrgIds({tables,raw:memoryRawStore(),lookup,asOf},targets,{batchId:null});
+  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',targets:targets.length,planned:res.planned,skipped:res.skippedSummary,errors:res.errors},null,1));
+  return;
+ }
+ const {batchId}=await startBatch(tables,{producer:'fill-cninfo-org-id',dataset:DATASET,toolVersions:{source:'cninfo_topsearch',as_of:asOf}});
+ let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
+ try{({counts,errors}=await fillCninfoOrgIds({tables,raw:supabaseRawStore(admin),lookup,asOf},targets,{batchId}));}
+ catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
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
diff --git a/scripts/entity-keys/fill-identifiers.ts b/scripts/entity-keys/fill-identifiers.ts
new file mode 100644
index 0000000..2faf3ce
--- /dev/null
+++ b/scripts/entity-keys/fill-identifiers.ts
@@ -0,0 +1,197 @@
+/**
+ * Fill ISIN/FIGI on open issuer_securities rows (spec §4.1): A GLEIF subset → B OpenFIGI by ISIN →
+ * D HKEX lists → C OpenFIGI by ticker for rows still without a FIGI.
+ *   npx tsx scripts/entity-keys/fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]
+ * --stage B implies A (B queries the ISINs A selects); default all. --gleif is needed for A/B,
+ * --hkex for D (files named as in HKEX_LIST_FILES; missing files are skipped).
+ * Dry run (default): no ingest batch, no DB or bucket writes (raw evidence is hashed in memory);
+ * OpenFIGI IS called and E1 before/after the planned writes is printed.
+ * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b live check, verification.md).
+ * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY (raises limits).
+ * tsx does not load .env.local: node --env-file=.env.local --import tsx scripts/entity-keys/fill-identifiers.ts …
+ */
+import {createHash} from 'node:crypto';
+import {createReadStream,existsSync,readFileSync,statSync} from 'node:fs';
+import {join} from 'node:path';
+import {createInterface} from 'node:readline';
+import {selectAll,supabaseTableClient,type Row,type TableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
+import {coverageE1} from '../../src/lib/entities/coverage';
+import {applyIdentifierPlan} from '../../src/lib/entities/identifiers/apply';
+import {filterGleifLines,subsetForLeis,type GleifSubset} from '../../src/lib/entities/identifiers/gleif';
+import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexIsin,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
+import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,mapIsins,mapTickers,type FigiJobResult} from '../../src/lib/entities/identifiers/openfigi';
+import {planIdentifierWrites,type IdentifierPlan,type IssuerRow,type PlanInput,type SecRow,type Stage} from '../../src/lib/entities/identifiers/plan';
+import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
+import {makeBudget} from '../../src/lib/facts/sync';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const DATASET=DATASETS.entities.identifiers;
+const USAGE='usage: fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]';
+const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+const STAGES:Record<string,Stage[]>={A:['A'],B:['A','B'],C:['C'],D:['D'],all:['A','B','C','D']};
+const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
+const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
+const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
+
+interface Args{gleif:string|null;hkex:string|null;stages:Set<Stage>;issuers:string[];apply:boolean}
+function bad():never{console.error(USAGE);process.exit(2);}
+function parseArgs(argv:string[]):Args{
+ const a:Args={gleif:null,hkex:null,stages:new Set(STAGES.all),issuers:[],apply:false};
+ for(let i=0;i<argv.length;i++){
+  const k=argv[i];
+  if(k==='--apply')a.apply=true;
+  else if(k==='--gleif')a.gleif=argv[++i]??bad();
+  else if(k==='--hkex')a.hkex=argv[++i]??bad();
+  else if(k==='--stage'){const s=STAGES[argv[++i]??''];if(!s)bad();a.stages=new Set(s);}
+  else if(k==='--issuer'){const id=argv[++i]??bad();if(!UUID.test(id))bad();a.issuers.push(id.toLowerCase());}
+  else bad();
+ }
+ if(a.stages.has('A')&&(!a.gleif||!existsSync(a.gleif)))bad();
+ if(a.stages.has('D')&&(!a.hkex||!existsSync(a.hkex)))bad();
+ return a;
+}
+
+async function fileDigest(path:string):Promise<{sha256:string;bytes:number}>{
+ const h=createHash('sha256');let bytes=0;
+ for await(const chunk of createReadStream(path)){const b=chunk as Buffer;h.update(b);bytes+=b.length;}
+ return {sha256:h.digest('hex'),bytes};
+}
+
+interface Inputs{
+ issuers:IssuerRow[];openRows:SecRow[];universe:Set<string>;scope:Row[];issuerRows:Row[];
+ gleif:{subset:GleifSubset;sha256:string;bytes:number;downloaded:string}|null;
+ hkex:{parses:HkexListParse[];bytes:Map<HkexFileId,Uint8Array>}|null;
+}
+
+/** Everything that needs no network and no bucket: DB reads, the GLEIF subset, the HKEX parses. */
+async function readInputs(tables:TableClient,args:Args):Promise<Inputs>{
+ const issuerRows=await selectAll(tables,'issuers',{},'issuer_id');
+ const issuers=issuerRows.filter(r=>r.status==='active'&&(args.issuers.length===0||args.issuers.includes(String(r.issuer_id))))
+  .map(r=>({issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci)}));
+ const openRows=(await selectAll(tables,'issuer_securities',{valid_to:null},'ticker'))
+  .map(r=>({issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from),isin:str(r.isin),figi:str(r.figi),provenance:obj(r.provenance)}));
+ const universe=new Set((await selectAll(tables,'stocks_universe',{},'ticker')).map(r=>String(r.ticker)));
+ const scope=await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id');
+ let gleif:Inputs['gleif']=null;
+ if(args.stages.has('A')){
+  const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
+  const lines:string[]=[];
+  for await(const l of filterGleifLines(createInterface({input:createReadStream(args.gleif!),crlfDelay:Infinity}),leis))lines.push(l);
+  const digest=await fileDigest(args.gleif!);
+  gleif={subset:subsetForLeis(lines,leis),...digest,downloaded:statSync(args.gleif!).mtime.toISOString().slice(0,10)};
+ }
+ let hkex:Inputs['hkex']=null;
+ if(args.stages.has('D')){
+  const parses:HkexListParse[]=[];const bytes=new Map<HkexFileId,Uint8Array>();
+  for(const f of HKEX_LIST_FILES){
+   const p=join(args.hkex!,f.file);
+   if(!existsSync(p))continue;
+   const b=new Uint8Array(readFileSync(p));
+   parses.push(parseHkexList(b,f.id));bytes.set(f.id,b);
+  }
+  hkex={parses,bytes};
+ }
+ return {issuers,openRows,universe,scope,issuerRows,gleif,hkex};
+}
+
+/** Stores the evidence, calls OpenFIGI (B, then C for rows still without a FIGI) and plans. */
+async function evidenceAndPlan(inp:Inputs,raw:RawStore,args:Args,asOf:string):Promise<{plan:IdentifierPlan;exhausted:boolean;requests:number}>{
+ if(inp.gleif)await raw.put({kind:'gleif',bytes:new TextEncoder().encode(inp.gleif.subset.csv),contentType:'text/csv',
+  meta:{source_sha256:inp.gleif.sha256,source_bytes:inp.gleif.bytes,downloaded:inp.gleif.downloaded,leis:inp.gleif.subset.byLei.size}});
+ let hkexMap:ReadonlyMap<string,HkexIsin>|null=null;
+ if(inp.hkex){
+  // each workbook keeps its own content type (two are .xls)
+  for(const p of inp.hkex.parses){
+   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
+   await raw.put({kind:'hkex',bytes:inp.hkex.bytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
+  }
+  const merged=mergeHkexIsins(inp.hkex.parses);
+  hkexMap=merged.hasIsinColumn?merged.byCode:null;
+ }
+ const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null,budget:makeBudget(null)};
+ let isinResults:ReadonlyMap<string,FigiJobResult>=new Map();
+ let exhausted=false,requests=0;
+ if(args.stages.has('B')&&inp.gleif){
+  const m=await mapIsins([...new Set([...inp.gleif.subset.byLei.values()].flat())].sort(),deps);
+  isinResults=m.byKey;exhausted=m.exhausted;requests+=m.requests;
+ }
+ const base:PlanInput={asOf,stages:args.stages,issuers:inp.issuers,openRows:inp.openRows,universe:inp.universe,
+  gleif:inp.gleif?{sha256:inp.gleif.subset.sha256,byLei:inp.gleif.subset.byLei}:null,isinResults,tickerResults:new Map(),hkex:hkexMap};
+ let plan=planIdentifierWrites(base);
+ if(args.stages.has('C')&&!exhausted&&plan.figiMissing.length){
+  const m=await mapTickers(plan.figiMissing,deps);
+  exhausted=m.exhausted;requests+=m.requests;
+  plan=planIdentifierWrites({...base,tickerResults:m.byKey});
+ }
+ return {plan,exhausted,requests};
+}
+
+function summary(plan:IdentifierPlan){
+ const by=(xs:string[])=>xs.reduce<Record<string,number>>((m,x)=>{m[x]=(m[x]??0)+1;return m;},{});
+ return {
+  writes:by(plan.writes.map(w=>`${w.kind}:${w.column}`)),claims:by(plan.claims.map(c=>`${c.op}:${c.id_type}`)),quarantines:plan.quarantines.length,
+  recons:{passed:plan.recons.filter(r=>r.passed).length,failed:plan.recons.filter(r=>!r.passed).length},
+  ahCandidates:plan.ahCandidates.length,duplicates:plan.duplicates,figiMissing:plan.figiMissing.length,skipped:by(plan.skipped),
+ };
+}
+function projectedRows(inp:Inputs,plan:IdentifierPlan):Row[]{
+ const k=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
+ const sets=new Map(plan.writes.filter(w=>w.kind==='set').map(w=>[`${k(w)}|${w.column}`,w.value]));
+ return inp.openRows.map(r=>({...r,valid_to:null,isin:r.isin??sets.get(`${k(r)}|isin`)??null,figi:r.figi??sets.get(`${k(r)}|figi`)??null}));
+}
+
+async function main(){
+ const args=parseArgs(process.argv.slice(2));
+ if(args.apply&&!EXCH_MAP_VERIFIED){
+  console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (docs/audits/2026-11-05-data-foundation-3/verification.md)');
+  process.exit(2);
+ }
+ const admin=getAdminSupabase();
+ const tables=supabaseTableClient(admin);
+ const asOf=new Date().toISOString().slice(0,10);
+ let inp:Inputs;
+ try{inp=await readInputs(tables,args);}
+ catch(e){
+  // A malformed GLEIF/HKEX file still leaves a failed receipt in --apply mode (spec §8 invalid_schema).
+  const code=errorMessage(e)==='invalid_schema'?'invalid_schema':'exception';
+  if(args.apply){
+   const {batchId}=await startBatch(tables,{producer:'fill-identifiers',dataset:DATASET,toolVersions:{openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION}});
+   await finishBatch(tables,batchId,{counts:emptyCounts(),errors:[{code,message:errorMessage(e)}]});
+   await recordAttempt(tables,DATASET,{ok:false,cadence:cadenceOf(DATASET)});
+  }
+  console.error(`${code}: ${errorMessage(e)}`);process.exit(1);
+ }
+ if(!args.apply){
+  const {plan,exhausted,requests}=await evidenceAndPlan(inp,memoryRawStore(),args,asOf);
+  console.log(JSON.stringify({
+   mode:'dry-run (no batch, nothing written; pass --apply)',stages:[...args.stages].sort().join(''),issuers:inp.issuers.length,openfigiRequests:requests,quotaExhausted:exhausted,
+   plan:summary(plan),
+   e1:{current:coverageE1({scope:inp.scope,securities:inp.openRows.map(r=>({...r,valid_to:null})),issuers:inp.issuerRows}),projected:coverageE1({scope:inp.scope,securities:projectedRows(inp,plan),issuers:inp.issuerRows})},
+  },null,1));
+  return;
+ }
+ const {batchId}=await startBatch(tables,{producer:'fill-identifiers',dataset:DATASET,toolVersions:{
+  gleif_file_sha256:inp.gleif?.sha256??'none',gleif_subset_sha256:inp.gleif?.subset.sha256??'none',
+  hkex_file_sha256s:JSON.stringify(Object.fromEntries((inp.hkex?.parses??[]).map(p=>[p.file,p.sha256]))),
+  openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,stages:[...args.stages].sort().join(''),as_of:asOf,
+ }});
+ let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
+ try{
+  const {plan,exhausted}=await evidenceAndPlan(inp,supabaseRawStore(admin),args,asOf);
+  ({counts,errors}=await applyIdentifierPlan(tables,plan,{batchId,dataset:DATASET}));
+  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs of this run skipped'}];
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
diff --git a/src/lib/dq/raw-store.ts b/src/lib/dq/raw-store.ts
index d5faeb7..22306ac 100644
--- a/src/lib/dq/raw-store.ts
+++ b/src/lib/dq/raw-store.ts
@@ -12,8 +12,8 @@ import type {SupabaseClient} from '@supabase/supabase-js';
 import type {Budget} from '../facts/types';
 
 export const RECONCILE_RAW_BUCKET='reconcile-raw';
-export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf';
-export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf'];
+export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo';
+export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo'];
 export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
 export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
 export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
diff --git a/src/lib/entities/cninfo-org-id.test.ts b/src/lib/entities/cninfo-org-id.test.ts
new file mode 100644
index 0000000..2db9309
--- /dev/null
+++ b/src/lib/entities/cninfo-org-id.test.ts
@@ -0,0 +1,64 @@
+// src/lib/entities/cninfo-org-id.test.ts
+import {describe,it,expect} from 'vitest';
+import {TableError,type TableClient} from '../db/table-client';
+import {memoryTableClient} from '../db/memory-table-client';
+import {memoryRawStore} from '../dq/raw-store';
+import {cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from './cninfo-org-id';
+
+const USCI='91520000214434146R';
+const issuer=(id:string,o:Record<string,unknown>)=>({issuer_id:id,status:'active',merged_into:null,usci:USCI,cninfo_org_id:null,lei:null,cik:null,canonical_name_zh:'测试',canonical_name_en:null,provenance:{usci:{source:'test'}},updated_at:'2026-01-01T00:00:00Z',...o});
+const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'A',is_primary:false,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{},...o});
+async function seed(){
+ const c=memoryTableClient({issuers:['issuer_id'],issuer_identifier_claims:['id']});
+ await c.insert('issuers',issuer('a',{}));
+ await c.insert('issuers',issuer('b',{cninfo_org_id:'gssh0600000'}));
+ await c.insert('issuers',issuer('c',{usci:null}));
+ await c.insert('issuers',issuer('d',{}));
+ await c.insert('issuers',issuer('e',{}));
+ await c.insert('issuers',issuer('m',{status:'merged',merged_into:'a'}));
+ await c.insert('issuer_securities',sec('a','02600.HK'));
+ await c.insert('issuer_securities',sec('a','600519.SH',{is_primary:true}));
+ await c.insert('issuer_securities',sec('d','ZZD'));
+ await c.insert('issuer_securities',sec('e','000001.SZ'));
+ await c.insert('issuer_securities',sec('e','000002.SZ',{valid_to:'2021-01-01'}));
+ return c;
+}
+const bytes=(s:string)=>new TextEncoder().encode(s);
+const lookups=(m:Record<string,CninfoLookup|Error>)=>async(code:string)=>{const v=m[code];if(v instanceof Error)throw v;if(!v)throw new Error(`unexpected ${code}`);return v;};
+
+describe('cninfo org id fill',()=>{
+ it('targets active issuers with a USCI, no orgId and an open A-share row (primary first)',async()=>{
+  const c=await seed();
+  expect((await cninfoTargets(c)).map(t=>[t.issuer_id,t.code,t.ticker])).toEqual([['a','600519','600519.SH'],['e','000001','000001.SZ']]);
+ });
+ it('writes a guarded update with replayable provenance and stores the raw response',async()=>{
+  const c=await seed();const raw=memoryRawStore();
+  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'贵州茅台'},bytes:bytes('[{"code":"600519","orgId":"gssh0600519"}]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
+  const a=c.rows('issuers').find(r=>r.issuer_id==='a')!;
+  expect(a.cninfo_org_id).toBe('gssh0600519');
+  const prov=(a.provenance as Record<string,{evidence_sha256:string}>);
+  expect(prov.usci).toEqual({source:'test'});
+  expect(prov.cninfo_org_id).toMatchObject({source:'cninfo_topsearch',as_of:'2026-11-05'});
+  expect([...raw.objects.keys()].some(k=>k.includes(prov.cninfo_org_id.evidence_sha256))).toBe(true);
+  expect(res.counts).toMatchObject({fetched:1,inserted:1,failed:0});
+  expect(res.skippedSummary).toEqual({org_id_not_found:1});
+  expect(res.planned.map(p=>p.outcome)).toEqual(['written','not_found']);
+ });
+ it('turns a unique-index clash into a set_identifier claim and a lookup failure into failed',async()=>{
+  const c=await seed();
+  const clash:TableClient={...c,update:async(t,m,p)=>{if(t==='issuers'&&p.cninfo_org_id==='gssz0000001')throw new TableError('update','issuers','duplicate key value violates unique constraint "issuers_cninfo_idx"','23505');return c.update(t,m,p);}};
+  const res=await fillCninfoOrgIds({tables:clash,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':new Error('cninfo 503'),'000001':{hit:{orgId:'gssz0000001',name:'平安银行'},bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
+  const claims=c.rows('issuer_identifier_claims');
+  expect(claims.map(x=>[x.issuer_id,x.id_type,x.value,x.op,x.source])).toEqual([['e','cninfo_org_id','gssz0000001','set_identifier','cninfo_topsearch']]);
+  expect((claims[0].detail as {target:unknown;evidence_kind:string})).toMatchObject({target:{issuer_id:'e'},evidence_kind:'provider_mapping'});
+  expect(res.counts).toMatchObject({failed:1});
+  expect(res.errors.map(e=>e.code)).toEqual(['claims_summary','cninfo_error']);
+ });
+ it('dry run (batchId null) looks up but writes nothing and stores nothing',async()=>{
+  const c=await seed();const raw=memoryRawStore();
+  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:null});
+  expect(c.rows('issuers').find(r=>r.issuer_id==='a')!.cninfo_org_id).toBeNull();
+  expect(raw.objects.size).toBe(0);
+  expect(res.planned.map(p=>[p.code,p.orgId,p.outcome])).toEqual([['600519','gssh0600519','planned'],['000001',null,'not_found']]);
+ });
+});
diff --git a/src/lib/entities/cninfo-org-id.ts b/src/lib/entities/cninfo-org-id.ts
new file mode 100644
index 0000000..bf815fd
--- /dev/null
+++ b/src/lib/entities/cninfo-org-id.ts
@@ -0,0 +1,76 @@
+// src/lib/entities/cninfo-org-id.ts
+// Spec §4.1.6: fill issuers.cninfo_org_id for active issuers that have a USCI, no orgId and an open
+// .SH/.SZ row, from 巨潮 topSearch (exact code match, landed resolveOrgId). The guarded update only
+// fills an empty column of an active issuer; a unique-index clash (another issuer holds the orgId)
+// becomes a set_identifier claim; a different value appearing concurrently becomes
+// correct_identifier. The exact topSearch response bytes go to reconcile-raw (kind 'cninfo') so
+// the provenance/claim hash is replayable. batchId null = dry run (no bucket, no DB writes).
+import {selectAll,type TableClient} from '../db/table-client';
+import {emptyCounts,type BatchError} from '../dq/batches';
+import type {RawStore} from '../dq/raw-store';
+import {fileClaim,isUnique,type ClaimInput} from './claims';
+import {errorMessage,withSkippedSummary,type ApplyResult} from './load-sec';
+import type {ClaimEvidence} from './types';
+
+export interface CninfoLookup{hit:{orgId:string;name:string}|null;bytes:Uint8Array}
+export interface CninfoTarget{issuer_id:string;code:string;ticker:string;provenance:Record<string,unknown>}
+export interface CninfoDeps{tables:TableClient;raw:RawStore;lookup:(code:string)=>Promise<CninfoLookup>;asOf:string;sleep?:(ms:number)=>Promise<void>;intervalMs?:number}
+export interface CninfoPlanned{issuer_id:string;code:string;orgId:string|null;outcome:'written'|'duplicate'|'claimed'|'not_found'|'failed'|'planned'}
+
+const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
+const A_SHARE=/^\d{6}\.(SH|SZ)$/;
+
+export async function cninfoTargets(tables:TableClient):Promise<CninfoTarget[]>{
+ const issuers=(await selectAll(tables,'issuers',{status:'active',cninfo_org_id:null},'issuer_id')).filter(r=>typeof r.usci==='string'&&r.usci!=='');
+ const out:CninfoTarget[]=[];
+ for(const i of issuers){
+  const rows=await tables.select('issuer_securities',{issuer_id:i.issuer_id,valid_to:null},{orderBy:'ticker'});
+  const a=[...rows].sort((x,y)=>Number(y.is_primary===true)-Number(x.is_primary===true)).find(r=>A_SHARE.test(String(r.ticker)));
+  if(a)out.push({issuer_id:String(i.issuer_id),code:String(a.ticker).slice(0,6),ticker:String(a.ticker),provenance:obj(i.provenance)});
+ }
+ return out;
+}
+
+export async function fillCninfoOrgIds(deps:CninfoDeps,targets:readonly CninfoTarget[],opts:{batchId:string|null}):Promise<ApplyResult&{claims:Record<string,number>;planned:CninfoPlanned[]}>{
+ const {tables}=deps;
+ const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
+ const counts=emptyCounts();const errors:BatchError[]=[];const planned:CninfoPlanned[]=[];
+ const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
+ for(const [n,t] of targets.entries()){
+  if(n>0)await sleep(deps.intervalMs??600);
+  let look:CninfoLookup;
+  try{look=await deps.lookup(t.code);}
+  catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed'});continue;}
+  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found'});continue;}
+  const orgId=look.hit.orgId;
+  const plan=(outcome:CninfoPlanned['outcome'])=>planned.push({issuer_id:t.issuer_id,code:t.code,orgId,outcome});
+  if(opts.batchId===null){plan('planned');continue;}
+  try{
+   const stored=await deps.raw.put({kind:'cninfo',bytes:look.bytes,contentType:'application/json',meta:{code:t.code}});
+   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:stored.sha256,locator:`topSearch:keyWord=${t.code}`};
+   const claim=async(op:'set_identifier'|'correct_identifier',current:string|null)=>{
+    const c:ClaimInput={issuer_id:t.issuer_id,id_type:'cninfo_org_id',value:orgId,source:'cninfo_topsearch',op,detail:{
+     schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:t.issuer_id},params:op==='set_identifier'?{}:{expected_current:current,new_value:orgId},evidence,sources:[evidence],
+    }};
+    const created=await fileClaim(tables,c);
+    const k=created?op:`${op}_appended`;claims[k]=(claims[k]??0)+1;plan('claimed');
+   };
+   try{
+    const n=await tables.update('issuers',{issuer_id:t.issuer_id,status:'active',cninfo_org_id:null},{
+     cninfo_org_id:orgId,provenance:{...t.provenance,cninfo_org_id:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:stored.sha256}},updated_at:new Date().toISOString(),
+    });
+    if(n===1){counts.inserted++;plan('written');continue;}
+    const [now]=await tables.select('issuers',{issuer_id:t.issuer_id},{limit:1});
+    if(now?.cninfo_org_id===orgId){counts.duplicates++;plan('duplicate');continue;}
+    if(now?.status==='active'&&typeof now.cninfo_org_id==='string'){await claim('correct_identifier',now.cninfo_org_id);continue;}
+    counts.failed++;errors.push({code:'issuer_changed',key:t.issuer_id,message:'issuer no longer active'});plan('failed');
+   }catch(e){
+    if(isUnique(e)){await claim('set_identifier',null);continue;}
+    throw e;
+   }
+  }catch(e){counts.failed++;errors.push({code:'cninfo_write_error',key:t.issuer_id,message:errorMessage(e)});plan('failed');}
+ }
+ counts.fetched=counts.inserted+counts.duplicates+counts.failed;
+ const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
+ return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims,planned};
+}
diff --git a/src/lib/entities/coverage.test.ts b/src/lib/entities/coverage.test.ts
new file mode 100644
index 0000000..f520481
--- /dev/null
+++ b/src/lib/entities/coverage.test.ts
@@ -0,0 +1,31 @@
+// src/lib/entities/coverage.test.ts
+import {describe,it,expect} from 'vitest';
+import {coverageE1,meetsThreshold,ratio} from './coverage';
+
+describe('ratio',()=>{
+ it('formats a truncated two-decimal percentage with integer arithmetic and null for an empty denominator',()=>{
+  expect(ratio(2,3)).toEqual({num:2,den:3,pct:'66.66'});
+  expect(ratio(19,20)).toEqual({num:19,den:20,pct:'95.00'});
+  expect(ratio(0,0)).toEqual({num:0,den:0,pct:null});
+  expect(meetsThreshold(ratio(19,20),95)).toBe(true);
+  expect(meetsThreshold(ratio(18,19),95)).toBe(false);
+  expect(meetsThreshold(ratio(0,0),95)).toBe(false);
+ });
+});
+
+describe('coverageE1',()=>{
+ it('counts open rows of US in-scope issuers (priority > 0); the ISIN denominator keeps issuers with a LEI',()=>{
+  const scope=[{issuer_id:'a',market:'US',priority:3},{issuer_id:'b',market:'US',priority:1},{issuer_id:'c',market:'US',priority:0},{issuer_id:'d',market:'CN',priority:5}];
+  const issuers=[{issuer_id:'a',lei:'HWUPKR0MPOU8FGXBT394'},{issuer_id:'b',lei:null},{issuer_id:'c',lei:'X'},{issuer_id:'d',lei:'Y'}];
+  const securities=[
+   {issuer_id:'a',ticker:'AAPL',valid_to:null,figi:'BBG000B9XRY4',isin:'US0378331005'},
+   {issuer_id:'a',ticker:'AAPL.OLD',valid_to:'2020-01-01',figi:null,isin:null},
+   {issuer_id:'b',ticker:'ZZB',valid_to:null,figi:null,isin:null},
+   {issuer_id:'c',ticker:'ZZC',valid_to:null,figi:null,isin:null},
+   {issuer_id:'d',ticker:'600519.SH',valid_to:null,figi:null,isin:null},
+  ];
+  expect(coverageE1({scope,securities,issuers})).toEqual({
+   figi:{num:1,den:2,pct:'50.00'},isin:{num:1,den:1,pct:'100.00'},passes:{figi:false,isin:true},
+  });
+ });
+});
diff --git a/src/lib/entities/coverage.ts b/src/lib/entities/coverage.ts
new file mode 100644
index 0000000..8639272
--- /dev/null
+++ b/src/lib/entities/coverage.ts
@@ -0,0 +1,26 @@
+// src/lib/entities/coverage.ts
+// Success-criteria measurements (spec §1.1): E1 = FIGI/ISIN coverage of the open security rows of
+// US in-scope issuers (fact_sync_scope market 'US', priority > 0); E2 (Task 5a) = listing-date
+// windows on research-queue A/H rows. Pure functions over rows the coverage script reads; integer
+// arithmetic only, percentages truncated to two decimals and never used for thresholds.
+import type {Row} from '../db/table-client';
+
+export interface Ratio{num:number;den:number;pct:string|null}
+export function ratio(num:number,den:number):Ratio{
+ if(den===0)return {num,den,pct:null};
+ const bp=Math.floor(num*10000/den);
+ return {num,den,pct:`${Math.floor(bp/100)}.${String(bp%100).padStart(2,'0')}`};
+}
+/** num/den >= pct% by cross-multiplication; an empty denominator never passes. */
+export const meetsThreshold=(r:Ratio,pct:number)=>r.den>0&&r.num*100>=r.den*pct;
+
+export interface E1Result{figi:Ratio;isin:Ratio;passes:{figi:boolean;isin:boolean}}
+export function coverageE1(input:{scope:readonly Row[];securities:readonly Row[];issuers:readonly Row[]}):E1Result{
+ const inScope=new Set(input.scope.filter(s=>s.market==='US'&&typeof s.priority==='number'&&s.priority>0).map(s=>String(s.issuer_id)));
+ const withLei=new Set(input.issuers.filter(i=>typeof i.lei==='string'&&i.lei!=='').map(i=>String(i.issuer_id)));
+ const rows=input.securities.filter(s=>s.valid_to==null&&inScope.has(String(s.issuer_id)));
+ const isinRows=rows.filter(s=>withLei.has(String(s.issuer_id)));
+ const figi=ratio(rows.filter(s=>s.figi!=null).length,rows.length);
+ const isin=ratio(isinRows.filter(s=>s.isin!=null).length,isinRows.length);
+ return {figi,isin,passes:{figi:meetsThreshold(figi,95),isin:meetsThreshold(isin,90)}};
+}

exec
/bin/zsh -lc 'cat ../../../AGENTS.md; cat src/lib/entities/identifiers/plan.ts; cat src/lib/research/ingest/collectors/cninfo.ts; cat src/lib/db/table-client.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/entities/identifiers/plan.ts
// Pure planning of ISIN/FIGI writes (spec §4.1.2–§4.1.4). Inputs: the run's evidence (GLEIF subset,
// OpenFIGI job results by ISIN and by ticker, merged HKEX lists) and the current open security rows.
// Output: guarded column writes (one sanitized provenance key each), claim/1 claims, ownership
// quarantines and HKEX-vs-GLEIF text reconciliations. A stored value is never overwritten: a
// different value becomes correct_identifier. Several candidate values for one row/column are
// ambiguous and only produce claims. HK tickers found for an issuer that holds A shares are left
// to link-ah (spec §4.2.2 rule 1; contract issue 5). FIGI candidates are aggregated per target
// security across all results before any decision; HKEX-vs-GLEIF corrections are resolved against
// the ISIN actually stored (or filed by apply once the HKEX write lands).
import type {ClaimInput} from '../claims';
import {sanitizeProvenance} from '../provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,EvidenceKind} from '../types';
import type {HkexIsin} from './hkex-list';
import {groupFigiResults,type FigiGroup,type FigiJob,type FigiJobResult} from './openfigi';

export const ISIN_RECON_PAIR='entities.isin_hkex_vs_gleif' as const;
export type Stage='A'|'B'|'C'|'D';
export interface SecRow{issuer_id:string;ticker:string;valid_from:string;isin:string|null;figi:string|null;provenance:Record<string,unknown>}
export interface IssuerRow{issuer_id:string;lei:string|null;usci:string|null}
export interface PlanInput{
 asOf:string;stages:ReadonlySet<Stage>;
 /** the run's active issuers */
 issuers:readonly IssuerRow[];
 /** ALL open (valid_to null) security rows: ownership lookups use every issuer's rows */
 openRows:readonly SecRow[];
 universe:ReadonlySet<string>;
 gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>}|null;
 isinResults:ReadonlyMap<string,FigiJobResult>;
 tickerResults:ReadonlyMap<string,FigiJobResult>;
 /** 5-digit stock code → ISIN (mergeHkexIsins); null or empty = no HKEX ISIN source this run */
 hkex:ReadonlyMap<string,HkexIsin>|null;
}
export type IdColumn='isin'|'figi';
export interface SecurityWrite{
 kind:'set'|'provenance';issuer_id:string;ticker:string;valid_from:string;column:IdColumn;value:string;
 /** exactly one sanitized provenance key ({isin:…} or {figi:…}); apply merges it into the stored object */
 patch:Record<string,unknown>;source:string;evidenceKind:EvidenceKind;evidence:ClaimEvidence;
 /** every evidence item behind the value (the primary one first); claims built from this write carry all of them */
 sources:ClaimEvidence[];
 /** claims that only make sense once this value is stored: apply files them when the write lands (written or duplicate) */
 followUps?:ClaimInput[];
}
export interface PlannedQuarantine{naturalKey:string;reasonCode:'ownership_conflict';detail:Record<string,unknown>;payload:Record<string,unknown>}
export interface PlannedRecon{naturalKey:string;passed:boolean;leftText:string;rightText:string;leftSource:string;rightSource:string;detail:Record<string,unknown>}
export interface AhCandidate{issuer_id:string;ticker:string;isin:string;evidence:ClaimEvidence}
export interface IdentifierPlan{writes:SecurityWrite[];claims:ClaimInput[];quarantines:PlannedQuarantine[];recons:PlannedRecon[];duplicates:number;skipped:string[];figiMissing:string[];ahCandidates:AhCandidate[]}

interface Proposal{value:string;source:string;kind:EvidenceKind;evidence:ClaimEvidence;prov:Record<string,unknown>;sources?:ClaimEvidence[];after?:ClaimInput[]}
interface FigiEntry{row:SecRow;groups:Map<string,{g:FigiGroup;r:Extract<FigiJobResult,{status:'ok'}>}>}
type OkResult=Extract<FigiJobResult,{status:'ok'}>;
type Op=Exclude<ClaimOp,'legacy'>;
const keyOf=(r:{issuer_id:string;ticker:string;valid_from:string})=>`${r.issuer_id}|${r.ticker}|${r.valid_from}`;
const targetOf=(r:SecRow)=>({issuer_id:r.issuer_id,ticker:r.ticker,valid_from:r.valid_from});
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};

export function planIdentifierWrites(input:PlanInput):IdentifierPlan{
 const {asOf,stages}=input;
 const out:IdentifierPlan={writes:[],claims:[],quarantines:[],recons:[],duplicates:0,skipped:[],figiMissing:[],ahCandidates:[]};
 const runIds=new Set(input.issuers.map(i=>i.issuer_id));
 const runRows=input.openRows.filter(r=>runIds.has(r.issuer_id));
 const runRowByKey=new Map(runRows.map(r=>[`${r.issuer_id}|${r.ticker}`,r]));
 const openOwner=new Map(input.openRows.map(r=>[r.ticker,r.issuer_id]));
 const holdsA=new Set(input.openRows.filter(r=>/\.(SH|SZ)$/.test(r.ticker)).map(r=>r.issuer_id));
 const proposals=new Map<string,{row:SecRow;col:IdColumn;list:Proposal[]}>();
 const figiCands=new Map<string,FigiEntry>();
 const propose=(row:SecRow,col:IdColumn,p:Proposal)=>{
  const k=`${keyOf(row)}|${col}`;
  const e=proposals.get(k)??{row,col,list:[]};
  if(!e.list.some(x=>x.value===p.value))e.list.push(p);
  proposals.set(k,e);
 };
 const claim=(c:{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Op;kind:EvidenceKind;target:ClaimDetail['target'];params:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];written?:Record<string,unknown>},into:ClaimInput[]=out.claims)=>{
  into.push({issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,op:c.op,detail:{
   schema:'claim/1',evidence_kind:c.kind,target:c.target,params:c.params,evidence:c.evidence,sources:c.sources??[c.evidence],...(c.written?{provenance_written:c.written}:{}),
  }});
 };
 const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
 const figiProposal=(r:OkResult,g:FigiGroup):Proposal=>({
  value:g.figi,source:'openfigi',kind:'provider_mapping',
  evidence:openfigiEvidence(r),
  prov:{source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,job:jobOf(r.job),level:g.level},
 });
  // FIGI candidates are collected per target security across every result (all ISINs, stage C) and decided once,
 // so the order of ISIN iteration never changes the outcome (spec §4.1.2; Codex review P1).
 const addFigi=(row:SecRow,r:OkResult,groups:FigiGroup[])=>{
  const e=figiCands.get(keyOf(row))??{row,groups:new Map()};
  figiCands.set(keyOf(row),e);
  for(const g of groups){
   const old=e.groups.get(g.figi);
   if(!old||r.evidence.response_sha256<old.r.evidence.response_sha256)e.groups.set(g.figi,{g,r});
  }
 };
 const decideFigi=(e:FigiEntry)=>{
  const list=[...e.groups.values()].sort((x,y)=>x.g.figi<y.g.figi?-1:x.g.figi>y.g.figi?1:0);
  if(list.length===1){propose(e.row,'figi',figiProposal(list[0].r,list[0].g));return;}
  out.skipped.push('figi_multiple_groups');
  const note=`one of ${list.length} candidate FIGIs: ${list.map(x=>`${x.g.figi}(${x.g.level})`).join(', ')}`;
  const candidates=list.map(x=>({figi:x.g.figi,level:x.g.level}));
  for(const {g,r} of list){
   if(e.row.figi===g.figi){out.duplicates++;continue;}
   const p=figiProposal(r,g);
   const op:Op=e.row.figi===null?'set_identifier':'correct_identifier';
   claim({issuer_id:e.row.issuer_id,id_type:'figi',value:g.figi,source:'openfigi',op,kind:'provider_mapping',target:targetOf(e.row),
    params:op==='set_identifier'?{candidates}:{expected_current:e.row.figi,new_value:g.figi,candidates},evidence:{...p.evidence,note},written:sanitizeProvenance({figi:p.prov})});
  }
 };

 // Stage B: ISIN (from GLEIF, stage A) → OpenFIGI → (issuer via LEI, normalized ticker).
 if(stages.has('B')&&input.gleif){
  for(const iss of input.issuers){
   if(!iss.lei)continue;
   for(const isin of input.gleif.byLei.get(iss.lei)??[]){
    const r=input.isinResults.get(isin);
    if(!r){out.skipped.push('figi_not_queried');continue;}
    if(r.status!=='ok'){out.skipped.push(`openfigi_${r.status}`);continue;}
    const g=groupFigiResults(r.records);
    out.skipped.push(...g.skipped);
    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
    const evidence:ClaimEvidence={source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator};
    const isinProposal:Proposal={value:isin,source:'gleif_openfigi',kind:'provider_mapping',evidence,sources:[evidence,openfigiEvidence(r)],prov:{source:'gleif_openfigi',as_of:asOf,evidence_sha256:input.gleif.sha256,locator}};
    for(const c of g.candidates){
     const own=runRowByKey.get(`${iss.issuer_id}|${c.ticker}`);
     if(own){
      propose(own,'isin',isinProposal);
      addFigi(own,r,c.groups);
      continue;
     }
     if(!input.universe.has(c.ticker)){out.skipped.push('ticker_not_in_universe');continue;}
     const owner=openOwner.get(c.ticker);
     if(owner===undefined&&c.market==='HK'&&holdsA.has(iss.issuer_id)){
      out.ahCandidates.push({issuer_id:iss.issuer_id,ticker:c.ticker,isin,evidence});out.skipped.push('ah_link_candidate');continue;
     }
     claim({issuer_id:iss.issuer_id,id_type:'ticker',value:c.ticker,source:'gleif_openfigi',op:'attach_security',kind:'provider_mapping',target:{issuer_id:iss.issuer_id},
      params:{share_class:'unknown',valid_from:asOf,valid_from_method:'first_observed',source:'gleif_openfigi',isin},
      // an ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK, TCTZF): this one is only a co-mapping, so the reviewer must confirm it is the issuer's own listing
      evidence:{...evidence,note:`ticker ${c.ticker} co-mapped by ISIN ${isin}; listing not confirmed`}});
     if(owner!==undefined)out.quarantines.push({naturalKey:`${c.ticker}:${asOf}`,reasonCode:'ownership_conflict',
      detail:{reason:'ticker_owned_by_other_issuer',stage:'B',owner_issuer_id:owner},payload:{issuer_id:iss.issuer_id,ticker:c.ticker,isin}});
    }
   }
  }
 }

 // Stage D: HKEX is the primary ISIN source for .HK rows; stage-B values are compared, not written.
 if(stages.has('D')){
  if(!input.hkex||input.hkex.size===0)out.skipped.push('hkex_no_isin');
  else for(const row of runRows){
   const m=/^(\d{5})\.HK$/.exec(row.ticker);
   if(!m)continue;
   const hk=input.hkex.get(m[1]);
   if(!hk){out.skipped.push('hkex_code_not_listed');continue;}
   const source=`hkex_${hk.file}`,locator=`${hk.file}:row:${hk.row}`;
   const evidence:ClaimEvidence={source,as_of:asOf,evidence_sha256:hk.sha256,locator};
   const k=`${keyOf(row)}|isin`;
   const hkProposal:Proposal={value:hk.isin,source,kind:'official_list',evidence,prov:{source,as_of:asOf,evidence_sha256:hk.sha256,locator},after:[]};
   for(const b of proposals.get(k)?.list??[]){
    out.recons.push({naturalKey:`${row.ticker}:${row.valid_from}`,passed:b.value===hk.isin,leftText:b.value,rightText:hk.isin,leftSource:b.source,rightSource:source,
     detail:{left:{evidence_sha256:b.evidence.evidence_sha256,locator:b.evidence.locator},right:{document:hk.file,sha256:hk.sha256,locator:`row:${hk.row}`}}});
    // The GLEIF-side correction is only valid against the value actually stored: it assumes HKEX's value is (or becomes) stored.
    // Resolved below against the stored column (empty → filed by apply once the HKEX write lands; equal → filed now; else dropped).
    if(b.value!==hk.isin)claim({issuer_id:row.issuer_id,id_type:'isin',value:b.value,source:b.source,op:'correct_identifier',kind:b.kind,target:targetOf(row),
     params:{expected_current:hk.isin,new_value:b.value},evidence:b.evidence,sources:b.sources,written:sanitizeProvenance({isin:b.prov})},hkProposal.after!);
   }
   proposals.set(k,{row,col:'isin',list:[hkProposal]});
  }
 }

 // Stage C: TICKER → FIGI for rows that still have none.
 const hasFigi=(row:SecRow)=>row.figi!==null||figiCands.has(keyOf(row));
 if(stages.has('C')){
  for(const row of runRows){
   if(hasFigi(row))continue;
   const r=input.tickerResults.get(row.ticker);
   if(!r)continue;
   if(r.status!=='ok'){out.skipped.push(r.status==='not_found'?'figi_not_found':'openfigi_error');continue;}
   const g=groupFigiResults(r.records);
   out.skipped.push(...g.skipped);
   const c=g.candidates.find(x=>x.ticker===row.ticker);
   if(!c){out.skipped.push('figi_not_found');continue;}
   addFigi(row,r,c.groups);
  }
 }
 for(const e of figiCands.values())decideFigi(e);
 out.figiMissing=[...new Set(runRows.filter(r=>r.figi===null&&!figiCands.has(keyOf(r))&&!input.tickerResults.has(r.ticker)).map(r=>r.ticker))].sort();

 // Resolve proposals against the stored values.
 for(const {row,col,list} of proposals.values()){
  const current=row[col];
  if(list.length>1){
   out.skipped.push(`ambiguous_${col}`);
   const candidates=list.map(p=>({[col]:p.value}));
   for(const p of list){
    if(current===p.value)continue;
    const op:Op=current===null?'set_identifier':'correct_identifier';
    claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op,kind:p.kind,target:targetOf(row),
     params:op==='set_identifier'?{candidates}:{expected_current:current,new_value:p.value,candidates},evidence:p.evidence,sources:p.sources,written:sanitizeProvenance({[col]:p.prov})});
   }
   continue;
  }
  const p=list[0];
  const patch=sanitizeProvenance({[col]:p.prov});
  const write=(kind:SecurityWrite['kind'],followUps?:ClaimInput[])=>out.writes.push({kind,...targetOf(row),column:col,value:p.value,patch,source:p.source,evidenceKind:p.kind,evidence:p.evidence,sources:p.sources??[p.evidence],...(followUps?.length?{followUps}:{})});
  if(current===null){write('set',p.after);continue;}
  if(current===p.value){out.claims.push(...(p.after??[]));if(col in row.provenance)out.duplicates++;else write('provenance');continue;}
  claim({issuer_id:row.issuer_id,id_type:col,value:p.value,source:p.source,op:'correct_identifier',kind:p.kind,target:targetOf(row),
   params:{expected_current:current,new_value:p.value},evidence:p.evidence,sources:p.sources,written:patch});
 }
 out.skipped.sort();
 return out;
}
/**
 * 巨潮资讯 collector: topSearch resolves the orgId a code needs, then
 * hisAnnouncement/query lists announcements (PDF links). Unofficial endpoint:
 * one request every 500 ms, declared User-Agent, title + metadata only.
 */
import { companyName, createClient, errorMessage, inWindow, isoDate, localDate, Receipt, writeDocument, type Client } from './shared';
import type { CollectOptions, CollectReceipt } from './types';

export const CNINFO_TOPSEARCH = 'http://www.cninfo.com.cn/new/information/topSearch/query';
export const CNINFO_HISTORY = 'http://www.cninfo.com.cn/new/hisAnnouncement/query';
const STATIC = 'http://static.cninfo.com.cn/';
const PAGE_SIZE = 30;

export interface OrgLookup { orgId: string; name: string; category: string }

async function topSearch(code: string, client: Client): Promise<OrgLookup | null> {
  const res = await client.post(CNINFO_TOPSEARCH, `keyWord=${encodeURIComponent(code)}&maxNum=10`);
  if (!res.ok) throw new Error(`cninfo ${res.status}`);
  const rows = await res.json() as Array<{ code?: string; orgId?: string; zwjc?: string; category?: string }>;
  const hit = Array.isArray(rows) ? rows.find(r => r.code === code && typeof r.orgId === 'string') : undefined;
  return hit ? { orgId: hit.orgId!, name: hit.zwjc ?? '', category: hit.category ?? '' } : null;
}

/** Exact-code orgId lookup, exposed for the A2 back-fill script. */
export async function resolveOrgId(code: string, opts: { fetch?: typeof fetch; userAgent?: string }): Promise<OrgLookup | null> {
  return topSearch(code, createClient({ ctx: null as never, companies: [], since: '', fetch: opts.fetch, userAgent: opts.userAgent, minIntervalMs: 0 }, 500));
}

const aShareCode = (codes: string[]) => codes.map(c => /^(\d{6})\.(SH|SZ)$/.exec(c)).find(Boolean) as RegExpExecArray | undefined;
// The server filters by Beijing calendar date; ask for every date the UTC window can touch, then filter by exact instant.
const seDate = (since: string, until: string) => `${localDate(since, 8)}~${localDate(until, 8)}`;

interface Announcement { announcementId: string; announcementTitle: string; announcementTime: number; adjunctUrl: string; adjunctType?: string; secCode?: string; orgId?: string }

export async function collectCninfo(opts: CollectOptions): Promise<CollectReceipt> {
  const clock = opts.now ?? (() => new Date());
  const receipt = new Receipt('cninfo', opts.companies.length, clock);
  const client = createClient(opts, 500);
  const cap = opts.maxPerCompany ?? 50;
  for (const company of opts.companies) {
    const m = aShareCode(company.exchange_codes);
    if (!m) { receipt.r.skipped++; continue; }
    const code = m[1], column = m[2] === 'SH' ? 'sse' : 'szse';
    let orgId = company.cninfo_org_id;
    if (!orgId) {
      receipt.r.lookups!++;
      try {
        const hit = await topSearch(code, client);
        if (!hit) throw new Error(`no exact orgId match for ${code}`);
        orgId = hit.orgId;
      } catch (e) { receipt.fail({ company: companyName(company), stage: 'lookup', message: errorMessage(e), url: CNINFO_TOPSEARCH }); continue; }
    }
    let taken = 0;
    for (let pageNum = 1; taken < cap; pageNum++) {
      const body = new URLSearchParams({ pageNum: String(pageNum), pageSize: String(PAGE_SIZE), column, tabName: 'fulltext', plate: '', stock: `${code},${orgId}`, searchkey: '', secid: '', category: '', trade: '',
        seDate: seDate(opts.since, opts.until ?? clock().toISOString()), sortName: '', sortType: '', isHLtitle: 'true' }).toString();
      let page: { announcements?: Announcement[] | null; hasMore?: boolean };
      try {
        const res = await client.post(CNINFO_HISTORY, body);
        if (!res.ok) throw new Error(`cninfo ${res.status}`);
        page = await res.json();
      } catch (e) { receipt.fail({ company: companyName(company), stage: 'list', message: errorMessage(e), url: CNINFO_HISTORY }); break; }
      const list = page.announcements ?? [];
      for (const a of list) {
        if (taken >= cap) break;
        const eventTime = new Date(a.announcementTime).toISOString();
        const beijingDate = localDate(eventTime, 8); // announcementTime is Beijing midnight
        if (!inWindow(eventTime, opts.since, opts.until)) continue;
        taken++; receipt.r.fetched++;
        const url = STATIC + a.adjunctUrl;
        const title = a.announcementTitle.replace(/<[^>]+>/g, '');
        await writeDocument(opts, receipt, company, {
          source_type: 'FILING', title, url, raw_text: `${title}\n公告类型：${a.adjunctType ?? 'PDF'}\n公告时间：${beijingDate}\n证券代码：${a.secCode ?? code}\n原文：${url}`,
          published_at: beijingDate, trust_level: 'HIGH', entity_ids: [company.entity_id], market: 'A', permission: 'public', origin_type: 'filing',
          event_time: eventTime, available_at: clock().toISOString(),
          metadata: { collector: 'cninfo', announcement_id: a.announcementId, sec_code: a.secCode ?? code, org_id: a.orgId ?? orgId, adjunct_type: a.adjunctType ?? null, document_url: url },
        });
      }
      // A short page is the last page even if the server still claims hasMore (observed on the live endpoint).
      if (!page.hasMore || list.length < PAGE_SIZE) break;
    }
  }
  return receipt.finish();
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

exec
/bin/zsh -lc "cat src/lib/entities/identifiers/openfigi.ts | tail -180; cat src/lib/entities/load-sec.ts | grep -A25 'loaderOutcome'; cat src/lib/dq/batches.ts | grep -A45 'batchStatus\\|deriveStatus\\|finishBatch'; rg 'provenance|updated_at' src/lib/entities/load-gleif.ts; find . -name '*AGENTS*' -o -name CLAUDE.md; cat package.json | head -65" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 72ms:
 const o=item as {data?:unknown;error?:unknown;warning?:unknown};
 if(Array.isArray(o.data)){
  const records=o.data.map(r=>{
   if(!r||typeof r!=='object'||typeof (r as FigiRecord).figi!=='string')throw new OpenFigiError('invalid_schema','record');
   for(const k of ['ticker','exchCode','compositeFIGI','securityType'] as const){const v=(r as Record<string,unknown>)[k];if(v!==undefined&&v!==null&&typeof v!=='string')throw new OpenFigiError('invalid_schema',`record.${k}`);}
   return r as FigiRecord;
  });
  return records.length?{job,status:'ok',records,evidence}:{job,status:'not_found',message:'empty data',evidence};
 }
 if(typeof o.warning==='string')return {job,status:'not_found',message:o.warning,evidence};
 if(typeof o.error==='string')return {job,status:'error',message:o.error,evidence};
 throw new OpenFigiError('invalid_schema','job result');
}

// Process-wide limiters keyed on quota identity only (key vs no key), not on the fetch function.
const LIMITERS=new Map<string,FigiLimiter>();
function limiterFor(deps:OpenFigiDeps):FigiLimiter{
 if(deps.limiter)return deps.limiter;
 const id=deps.apiKey?`key:${deps.apiKey}`:'anon';
 let l=LIMITERS.get(id);
 if(!l){l=createFigiLimiter();LIMITERS.set(id,l);}
 return l;
}
const NO_LIMIT:Budget={remainingMs:()=>Infinity,signal:new AbortController().signal};

export async function mapJobs(jobs:readonly FigiJob[],deps:OpenFigiDeps):Promise<MapResult>{
 const {jobsPerRequest,minIntervalMs}=openFigiLimits(deps.apiKey);
 const wait=deps.sleep??abortableSleep;
 const now=deps.now??Date.now;
 const budget=deps.budget??NO_LIMIT;
 const reserveMs=deps.reserveMs??0;
 const limiter=limiterFor(deps);
 const results:(FigiJobResult|null)[]=jobs.map(()=>null);
 const failures:FigiFailure[]=[];
 const headers:Record<string,string>={'Content-Type':'application/json'};
 if(deps.apiKey)headers['X-OPENFIGI-APIKEY']=deps.apiKey;
 let requests=0;
 const store=async(bytes:Uint8Array,meta:Record<string,string|number>)=>{
  let json=true;
  try{JSON.parse(new TextDecoder().decode(bytes));}catch{json=false;}
  return deps.raw.put({kind:'openfigi',bytes,contentType:json?'application/json':'text/html',meta},deps.budget);
 };
 const done=(exhausted:boolean):MapResult=>({results,exhausted,requests,failures});
 /** false = the budget cannot afford the wait (caller reports exhausted). Aborts become OpenFigiError('budget_aborted'). */
 const waitUntilUnblocked=async():Promise<boolean>=>{
  const gap=limiter.blockedUntil-now();
  if(gap<=0)return true;
  if(budget.remainingMs()-gap<=reserveMs)return false;
  try{await wait(gap,budget.signal);}catch{throw new OpenFigiError('budget_aborted');}
  return true;
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
  const body=JSON.stringify(chunk);
  const req=await store(new TextEncoder().encode(body),{role:'request',jobs:chunk.length});
  let out=await send(body,req.sha256);
  if(out==='exhausted')return done(true);
  if(retryable(out.res)){
   backoff();   // published first: other callers back off even when this caller cannot afford the retry
   if(budget.remainingMs()-BACKOFF_MS<=reserveMs)return done(true);
   out=await send(body,req.sha256);
   if(out==='exhausted')return done(true);
  }
  if(retryable(out.res)){backoff();return done(true);}
  const res=out.res!;
  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
  let parsed:unknown;
  try{parsed=JSON.parse(new TextDecoder().decode(out.bytes!));}catch{throw new OpenFigiError('invalid_schema','response is not JSON',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});}
  if(!Array.isArray(parsed)||parsed.length!==chunk.length)throw new OpenFigiError('invalid_schema','response length',{status:res.status,request_sha256:req.sha256,response_sha256:out.sha});
  parsed.forEach((item,i)=>{results[start+i]=parseItem(chunk[i],item,{request_sha256:req.sha256,response_sha256:out.sha!,index:i});});
 }
 return done(false);
}

function keyed(keys:readonly string[],jobs:FigiJob[],out:MapResult,unsupported:string[]):MappedBy{
 const byKey=new Map<string,FigiJobResult>();const unprocessed:string[]=[];
 keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
 return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
}

export async function mapIsins(isins:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys=[...new Set(isins)];
 const jobs=keys.map(idValue=>({idType:'ID_ISIN' as const,idValue}));
 return keyed(keys,jobs,await mapJobs(jobs,deps),[]);
}

/** Reverse lookup for TICKER jobs (spec §4.1.3); null = no OpenFIGI exchange code for this ticker. */
export function exchCodeFor(ticker:string):{exchCode:string;idValue:string}|null{
 const cn=/^(\d{6})\.(SH|SZ)$/.exec(ticker);
 if(cn)return {exchCode:cn[2]==='SH'?'CG':'CS',idValue:cn[1]};
 const hk=/^(\d{5})\.HK$/.exec(ticker);
 if(hk)return {exchCode:'HK',idValue:hk[1].replace(/^0+(?=\d)/,'')};
 if(/^[A-Z][A-Z0-9.]{0,7}$/.test(ticker)&&!/\.(SH|SZ|BJ|HK)$/.test(ticker))return {exchCode:'US',idValue:ticker.replace(/\./g,'/')};
 return null;
}

export async function mapTickers(tickers:readonly string[],deps:OpenFigiDeps):Promise<MappedBy>{
 const keys:string[]=[],jobs:FigiJob[]=[],unsupported:string[]=[];
 for(const t of [...new Set(tickers)]){
  const x=exchCodeFor(t);
  if(!x){unsupported.push(t);continue;}
  keys.push(t);jobs.push({idType:'TICKER',idValue:x.idValue,exchCode:x.exchCode});
 }
 return keyed(keys,jobs,await mapJobs(jobs,deps),unsupported);
}

export function securityTickerFor(exchCode:string|null|undefined,ticker:string|null|undefined):{ok:true;market:FigiMarket;ticker:string}|{ok:false;reason:string}{
 const kind=exchCode&&Object.hasOwn(EXCH_MAP,exchCode)?EXCH_MAP[exchCode]:undefined;
 if(!kind)return {ok:false,reason:`exch_unknown:${exchCode??'null'}`};
 const raw=(ticker??'').trim().toUpperCase();
 if(kind==='US'){const t=normalizeSecurityTicker(raw,'US');return t?{ok:true,market:'US',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(kind==='HK'){const t=normalizeSecurityTicker(raw,'HK');return t?{ok:true,market:'HK',ticker:t}:{ok:false,reason:'ticker_invalid'};}
 if(!/^\d{6}$/.test(raw))return {ok:false,reason:'ticker_invalid'};
 const suffix=kind==='SH'?'SH':kind==='SZ'?'SZ':kind==='CH'?(/^[69]/.test(raw)?'SH':/^[03]/.test(raw)?'SZ':null):null;
 if(!suffix)return {ok:false,reason:`exch_unknown:CH:${raw[0]}`};
 return {ok:true,market:'CN',ticker:`${raw}.${suffix}`};
}

export interface FigiGroup{figi:string;level:'composite'|'venue';exchCodes:string[];securityType:string}
export interface FigiCandidate{market:FigiMarket;ticker:string;groups:FigiGroup[]}
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

export function groupFigiResults(records:readonly FigiRecord[]):{candidates:FigiCandidate[];skipped:string[]}{
 const sorted=[...records].sort((a,b)=>cmp(a.compositeFIGI??a.figi,b.compositeFIGI??b.figi)||cmp(a.exchCode??'',b.exchCode??'')||cmp(a.figi,b.figi));
 const byTicker=new Map<string,{market:FigiMarket;ticker:string;groups:Map<string,FigiGroup>}>();
 const skipped:string[]=[];
 for(const r of sorted){
  if(r.marketSector!=='Equity'){skipped.push(`market_sector:${r.marketSector??'null'}`);continue;}
  if(!r.securityType||!ALLOWED_SECURITY_TYPES.has(r.securityType)){skipped.push(`security_type:${r.securityType??'null'}`);continue;}
  const composite=typeof r.compositeFIGI==='string'&&r.compositeFIGI!=='';
  const figi=composite?r.compositeFIGI!:r.figi;
  if(!FIGI.test(figi)){skipped.push('invalid_figi');continue;}
  const t=securityTickerFor(r.exchCode,r.ticker);
  if(!t.ok){skipped.push(t.reason);continue;}
  const key=`${t.market}|${t.ticker}`;
  const entry=byTicker.get(key)??{market:t.market,ticker:t.ticker,groups:new Map<string,FigiGroup>()};
  byTicker.set(key,entry);
  const gk=`${composite?'c':'v'}:${figi}`;
  const g=entry.groups.get(gk)??{figi,level:composite?'composite':'venue',exchCodes:[],securityType:r.securityType};
  if(r.exchCode&&!g.exchCodes.includes(r.exchCode))g.exchCodes.push(r.exchCode);
  entry.groups.set(gk,g);
 }
 const candidates=[...byTicker.values()]
  .sort((a,b)=>cmp(`${a.market}|${a.ticker}`,`${b.market}|${b.ticker}`))
  .map(e=>({market:e.market,ticker:e.ticker,groups:[...e.groups.values()].map(g=>({...g,exchCodes:[...g.exchCodes].sort()})).sort((a,b)=>cmp(a.figi,b.figi))}));
 return {candidates,skipped:skipped.sort()};
}
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
rg: src/lib/entities/load-gleif.ts: IO error for operation on src/lib/entities/load-gleif.ts: No such file or directory (os error 2)
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

exec
/bin/zsh -lc "rg -n \"provenance:|updated_at:\" src/lib/entities/load*.ts | head -35; sed -n '1,100p' src/lib/entities/identifiers/apply.ts; rg -n 'quota_exhausted|isInfoError' src/lib/dq/batches.ts; git status --short; ls node_modules/.bin/vitest 2>/dev/null" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/load-sec.test.ts:47:   {cik:'320193',canonical_name_en:'Apple Inc.',provenance:{cik:prov,canonical_name_en:prov}},
src/lib/entities/load-sec.test.ts:48:   {cik:'1652044',canonical_name_en:'Alphabet Inc.',provenance:{cik:prov,canonical_name_en:prov}},
src/lib/entities/load-sec.test.ts:49:   {cik:'1067983',canonical_name_en:'Berkshire',provenance:{cik:prov,canonical_name_en:prov}},
src/lib/entities/load-sec.test.ts:52:   {cik:'320193',ticker:'AAPL',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{valid_from:{...prov,row:{exchange:'Nasdaq'}}}},
src/lib/entities/load-sec.test.ts:53:   {cik:'1652044',ticker:'GOOG',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{valid_from:{...prov,row:{exchange:'Nasdaq'}}}},
src/lib/entities/load-sec.test.ts:54:   {cik:'1652044',ticker:'GOOGL',share_class:'unknown',is_primary:false,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{valid_from:{...prov,row:{exchange:'Nasdaq'}}}},
src/lib/entities/load-sec.test.ts:55:   {cik:'1067983',ticker:'BRK.B',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{valid_from:{...prov,row:{exchange:'NYSE'}}}},
src/lib/entities/load-sec.ts:21:export interface PlannedIssuer{cik:string;canonical_name_en:string;provenance:{cik:FieldProvenance;canonical_name_en:FieldProvenance}}
src/lib/entities/load-sec.ts:22:export interface PlannedSecurity{cik:string;ticker:string;share_class:'unknown';is_primary:boolean;valid_from:string;source:string;provenance:{valid_from:{source:string;as_of:string;row:{exchange:string}}}}
src/lib/entities/load-sec.ts:51:  if(first)issuers.set(r.cik,{cik:r.cik,canonical_name_en:r.name,provenance:{cik:prov(),canonical_name_en:prov()}});
src/lib/entities/load-sec.ts:53:  securities.push({cik:r.cik,ticker,share_class:'unknown',is_primary:first,valid_from:asOf,source:SEC_SOURCE,provenance:{valid_from:{source:SEC_SOURCE,as_of:asOf,row:{exchange:r.exchange}}}});
// src/lib/entities/identifiers/apply.ts
// Writes an IdentifierPlan (spec §4.1.2 "写入"): guarded column sets (only an empty column of an open
// row), provenance-only completions, claim/1 claims, ownership quarantines and the
// entities.isin_hkex_vs_gleif text reconciliations (written directly until record.ts exists;
// contract issue 7). Each column write goes through the migration-one function set_security_identifier
// (plan audit R2): under the security-row lock it writes the empty column and merges its ONE provenance
// key with `||` in the same UPDATE, so a concurrent write of the other column or a claim resolution never
// loses its evidence key, and a failed sibling write never leaves provenance describing a value that is
// not stored. fetched = rows with a table outcome (claim filing failures count as failed but are not
// rows, so they stay out of fetched); claims-only outcomes are reported in claims_summary
// (informational), a correct_identifier also as identifier_mismatch (degrades the batch to partial).
// Follow-up claims of a write are filed only when its value is stored (written or duplicate).
import {randomUUID} from 'node:crypto';
import {callRpc,type TableClient} from '../../db/table-client';
import {emptyCounts,type BatchCounts,type BatchError} from '../../dq/batches';
import {DATASETS} from '../../dq/datasets';
import {fileClaim,isUnique,type ClaimInput} from '../claims';
import {errorMessage,parkConflict,withSkippedSummary} from '../load-sec';
import {ISIN_RECON_PAIR,type IdentifierPlan,type SecurityWrite} from './plan';

export interface IdentifierApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;claimsSummary:Record<string,number>}

type SetOutcome='written'|'duplicate'|'conflict'|'not_found';
const claimFor=(w:SecurityWrite,op:'set_identifier'|'correct_identifier',current:string|null):ClaimInput=>({
 issuer_id:w.issuer_id,id_type:w.column,value:w.value,source:w.source,op,detail:{
  schema:'claim/1',evidence_kind:w.evidenceKind,target:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from},
  params:op==='set_identifier'?{}:{expected_current:current,new_value:w.value},evidence:w.evidence,sources:w.sources,provenance_written:w.patch,
 },
});

export async function applyIdentifierPlan(tables:TableClient,plan:IdentifierPlan,opts:{batchId:string;dataset:string}):Promise<IdentifierApplyResult>{
 const counts=emptyCounts();
 const errors:BatchError[]=[];
 const claimsSummary:Record<string,number>={};
 let claimFailures=0;
 counts.duplicates=plan.duplicates;
 const fileOne=async(c:ClaimInput)=>{
  try{
   const created=await fileClaim(tables,c);
   const k=created?c.op:`${c.op}_appended`;
   claimsSummary[k]=(claimsSummary[k]??0)+1;
   if(c.op==='correct_identifier')errors.push({code:'identifier_mismatch',key:`${c.detail.target.ticker??c.issuer_id}:${c.id_type}`,message:`${String(c.detail.params.expected_current)} -> ${c.value}`});
  }catch(e){counts.failed++;claimFailures++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.id_type}:${c.value}`,message:errorMessage(e)});}
 };

 for(const w of plan.writes){
  const key={issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from};
  const where=`${w.ticker}:${w.valid_from}:${w.column}`;
  try{
   const outcome=await callRpc(tables,'set_security_identifier',{p_issuer:w.issuer_id,p_ticker:w.ticker,p_valid_from:w.valid_from,p_column:w.column,p_value:w.value,p_provenance:w.patch}) as SetOutcome;
   if(outcome==='written'){counts.inserted++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='duplicate'){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
   if(outcome==='conflict'){
    // another value is stored: read it for the claim's expected_current (resolution re-checks it under its own guard)
    const [cur]=await tables.select('issuer_securities',{...key,valid_to:null},{limit:1});
    const stored=cur?.[w.column]==null?null:String(cur[w.column]);
    if(stored===null){counts.failed++;errors.push({code:'row_changed',key:where,message:'stored value changed after conflict'});continue;}
    if(stored===w.value){counts.duplicates++;for(const f of w.followUps??[])await fileOne(f);continue;}
    await fileOne(claimFor(w,'correct_identifier',stored));continue;
   }
   counts.failed++;errors.push({code:'row_changed',key:where,message:outcome==='not_found'?'row missing or closed':`unexpected outcome ${String(outcome)}`});
  }catch(e){
   if(w.column==='isin'&&isUnique(e)){
    await fileOne(claimFor(w,'set_identifier',null));
    await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:`isin:${w.value}`,reasonCode:'ownership_conflict',
     detail:{reason:'isin_held_by_other_row',ticker:w.ticker,valid_from:w.valid_from},payload:{issuer_id:w.issuer_id,ticker:w.ticker,valid_from:w.valid_from,isin:w.value},batchId:opts.batchId},
     counts,errors,{code:'ownership_conflict',key:`isin:${w.value}`});
    continue;
   }
   counts.failed++;errors.push({code:'identifier_write_error',key:where,message:errorMessage(e)});
  }
 }
 for(const q of plan.quarantines){
  await parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey:q.naturalKey,reasonCode:q.reasonCode,detail:q.detail,payload:q.payload,batchId:opts.batchId},
   counts,errors,{code:q.reasonCode,key:q.naturalKey});
 }
 for(const c of plan.claims)await fileOne(c);
 for(const r of plan.recons){
  try{
   await tables.insert('dq_reconciliations',{
    id:randomUUID(),dataset:DATASETS.reconcile(ISIN_RECON_PAIR),pair:ISIN_RECON_PAIR,kind:'text',outcome:'compared',
    left_source:r.leftSource,right_source:r.rightSource,natural_key:r.naturalKey,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:0,passed:r.passed,
    detail:{left_text:r.leftText,right_text:r.rightText,...r.detail,tolerance_rule:'text_equal'},batch_id:opts.batchId,
    cycle_id:null,issuer_id:null,market:null,attempt:null,created_at:new Date().toISOString(),
   });
  }catch(e){errors.push({code:'reconciliation_error',key:r.naturalKey,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.versioned+counts.quarantined+counts.failed-claimFailures;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 const lead:BatchError[]=Object.keys(claimsSummary).length?[{code:'claims_summary',message:JSON.stringify(claimsSummary)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,claimsSummary};
}
51:export const isInfoError=(e:BatchError)=>(INFO_CODES as readonly string[]).includes(e.code);
66: if(counts.failed>0||errors.some(e=>!isInfoError(e)))return landed>0?'partial':'failed';
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gykrZEPo' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oGqIlIr2' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4b-review.md
node_modules/.bin/vitest

codex
The cninfo fill can overwrite concurrently updated provenance and discards raw evidence for unresolved lookups. These undermine evidence preservation in the new ingestion path.

Full review comments:

- [P2] Merge cninfo provenance atomically with the current issuer row — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/cninfo-org-id.ts:59-60
  If another loader or claim resolution updates issuer provenance after `cninfoTargets` reads it, this update replaces that newer provenance with the stale `t.provenance` snapshot. The guard only checks status and `cninfo_org_id`, so unrelated identifier evidence can be silently lost while its identifier remains stored. Merge the single provenance key under a database row lock, or use an optimistic concurrency guard with retry.

- [P2] Store negative lookup responses before skipping the target — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/cninfo-org-id.ts:44-44
  When topSearch returns no exact match, this early return bypasses raw storage entirely, despite the command promising to retain every response in apply mode. Consequently, unresolved lookups have no replayable evidence to distinguish an actual absence from an unexpected provider response. Persist received response bytes before branching on `look.hit`, while preserving the dry-run no-write behavior.
The cninfo fill can overwrite concurrently updated provenance and discards raw evidence for unresolved lookups. These undermine evidence preservation in the new ingestion path.

Full review comments:

- [P2] Merge cninfo provenance atomically with the current issuer row — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/cninfo-org-id.ts:59-60
  If another loader or claim resolution updates issuer provenance after `cninfoTargets` reads it, this update replaces that newer provenance with the stale `t.provenance` snapshot. The guard only checks status and `cninfo_org_id`, so unrelated identifier evidence can be silently lost while its identifier remains stored. Merge the single provenance key under a database row lock, or use an optimistic concurrency guard with retry.

- [P2] Store negative lookup responses before skipping the target — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/cninfo-org-id.ts:44-44
  When topSearch returns no exact match, this early return bypasses raw storage entirely, despite the command promising to retain every response in apply mode. Consequently, unresolved lookups have no replayable evidence to distinguish an actual absence from an unexpected provider response. Persist received response bytes before branching on `look.hit`, while preserving the dry-run no-write behavior.

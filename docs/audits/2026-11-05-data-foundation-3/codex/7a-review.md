OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b038-8bdf-7302-b92a-7ca3f699fdab
--------
user
commit 4146dde
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 4146dde; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pVpiJz2l' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YJ2cJ3V5' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oZKaGpww' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-b9NN7jKH' (errno=Operation not permitted)
4146dde feat(entities): company-name normalization and A+H linking (validated same-LEI attach at listing date, HKEX name-match claims)
 scripts/entity-keys/link-ah.ts             | 124 +++++++++++++++++++++
 src/lib/entities/identifiers/names.test.ts |  48 ++++++++
 src/lib/entities/identifiers/names.ts      |  26 +++++
 src/lib/entities/link-ah.test.ts           | 112 +++++++++++++++++++
 src/lib/entities/link-ah.ts                | 173 +++++++++++++++++++++++++++++
 5 files changed, 483 insertions(+)
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

exec
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 4146dde --format=fuller; cat AGENTS.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 441ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Jyx21qwm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-9zbFMyxg' (errno=Operation not permitted)
commit 4146dde61c5e26e7ab053fe6ec82231bea20d608
Author:     gilosbornhello <osbornhello@gmail.com>
AuthorDate: Fri Nov 6 01:37:23 2026 -0800
Commit:     gilosbornhello <osbornhello@gmail.com>
CommitDate: Fri Nov 6 01:37:23 2026 -0800

    feat(entities): company-name normalization and A+H linking (validated same-LEI attach at listing date, HKEX name-match claims)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/link-ah.ts b/scripts/entity-keys/link-ah.ts
new file mode 100644
index 0000000..8406afa
--- /dev/null
+++ b/scripts/entity-keys/link-ah.ts
@@ -0,0 +1,124 @@
+/**
+ * A+H linking (spec §4.2.2): rule 1 same LEI (GLEIF ISIN → OpenFIGI HK line → automatic attach at
+ * the listing date), rule 2 HKEX list name match (attach_security claims only).
+ *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
+ * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
+ * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is linked only when validated (HKEX code + ISIN, or ticker-level FIGI).
+ * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
+ * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
+ * (dataset entities.ah-link) and a freshness attempt.
+ * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY.
+ */
+import {createReadStream,existsSync,readFileSync} from 'node:fs';
+import {join} from 'node:path';
+import {createInterface} from 'node:readline';
+import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
+import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
+import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
+import {recordAttempt} from '../../src/lib/dq/freshness';
+import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
+import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers/gleif';
+import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
+import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
+import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
+import {applyAhLinks,figiHitsFromResults,planAhLinks,type AhIssuer,type UniverseListing} from '../../src/lib/entities/link-ah';
+import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
+import {getAdminSupabase} from '../../src/lib/supabase/admin';
+
+const DATASET=DATASETS.entities.ahLink;
+const USAGE='usage: link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]';
+const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
+const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
+function bad():never{console.error(USAGE);process.exit(2);}
+
+async function main(){
+ const argv=process.argv.slice(2);
+ let gleifPath:string|null=null,hkexDir:string|null=null,apply=false;
+ for(let i=0;i<argv.length;i++){
+  if(argv[i]==='--apply')apply=true;
+  else if(argv[i]==='--gleif')gleifPath=argv[++i]??bad();
+  else if(argv[i]==='--hkex')hkexDir=argv[++i]??bad();
+  else bad();
+ }
+ if(!gleifPath||!existsSync(gleifPath)||!hkexDir||!existsSync(hkexDir))bad();
+ if(apply&&!EXCH_MAP_VERIFIED){console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (verification.md)');process.exit(2);}
+ const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
+ const asOf=new Date().toISOString().slice(0,10);
+ const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
+ const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
+ const issuers:AhIssuer[]=(await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>{
+  const id=String(r.issuer_id);const tickers=open.filter(o=>String(o.issuer_id)===id).map(o=>String(o.ticker));
+  return {issuer_id:id,lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null),
+   aTickers:tickers.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:tickers.filter(t=>/^\d{5}\.HK$/.test(t))};
+ }).filter(i=>(i.aTickers.length>0||i.usci!==null)&&i.hTickers.length===0);
+ const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
+ const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
+ const lines:string[]=[];
+ for await(const l of filterGleifLines(createInterface({input:createReadStream(gleifPath),crlfDelay:Infinity}),leis))lines.push(l);
+ const subset=subsetForLeis(lines,leis);
+ const hkexParses:HkexListParse[]=[];const hkexBytes=new Map<HkexFileId,Uint8Array>();
+ for(const f of HKEX_LIST_FILES){
+  const p=join(hkexDir,f.file);
+  if(!existsSync(p))continue;
+  const b=new Uint8Array(readFileSync(p));
+  hkexParses.push(parseHkexList(b,f.id));hkexBytes.set(f.id,b);
+ }
+ const listParse=hkexParses.find(p=>p.file==='list_of_securities')??null;
+ const merged=hkexParses.length?mergeHkexIsins(hkexParses):null;
+ const hkexIsins=merged?.hasIsinColumn?merged.byCode:null;
+
+ const run=async(raw:RawStore,batchId:string|null)=>{
+  const gleifRaw=await raw.put({kind:'gleif',bytes:new TextEncoder().encode(subset.csv),contentType:'text/csv',meta:{purpose:'ah-link',leis:subset.byLei.size}});
+  const hkexRaw=new Map<HkexFileId,{sha256:string;path:string}>();
+  for(const p of hkexParses){
+   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
+   const st=await raw.put({kind:'hkex',bytes:hkexBytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
+   hkexRaw.set(p.file,{sha256:st.sha256,path:st.path});
+  }
+  const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
+  const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
+  const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
+  // OpenFIGI tickers are hints: HKEX code+ISIN validates; a ticker-level FIGI is the fallback for codes HKEX has no ISIN for
+  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
+  const tickerFigi=new Map<string,string>();
+  let exhausted=m.exhausted;
+  if(unvalidated.length&&!exhausted){
+   const t=await mapTickers(unvalidated,deps);
+   exhausted=t.exhausted;
+   for(const [tk,r] of t.byKey){
+    if(r.status!=='ok')continue;
+    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
+    if(c&&c.groups.length===1)tickerFigi.set(tk,c.groups[0].figi);
+   }
+  }
+  const listRaw=hkexRaw.get('list_of_securities');
+  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,tickerFigi,
+   hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
+   raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
+  return {plan,exhausted,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
+ };
+ if(!apply){
+  const {plan,exhausted}=await run(memoryRawStore(),null);
+  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',candidates:issuers.length,quotaExhausted:exhausted,
+   attaches:plan.attaches.map(a=>({issuer_id:a.issuer_id,ticker:a.ticker,share_class:a.share_class,valid_from:a.valid_from,method:a.valid_from_method})),
+   conflicts:plan.conflicts.length,claims:plan.claims.map(c=>({issuer_id:c.issuer_id,ticker:c.value})),skipped:plan.skipped.length},null,1));
+  return;
+ }
+ const {batchId}=await startBatch(tables,{producer:'link-ah',dataset:DATASET,toolVersions:{
+  gleif_subset_sha256:subset.sha256,hkex_file_sha256s:JSON.stringify(Object.fromEntries(hkexParses.map(p=>[p.file,p.sha256]))),openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,names:NAMES_VERSION,as_of:asOf}});
+ let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
+ try{
+  const {result,exhausted}=await run(supabaseRawStore(admin),batchId);
+  if(result)({counts,errors}=result);
+  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs skipped'}];
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
diff --git a/src/lib/entities/identifiers/names.test.ts b/src/lib/entities/identifiers/names.test.ts
new file mode 100644
index 0000000..b5ec8dd
--- /dev/null
+++ b/src/lib/entities/identifiers/names.test.ts
@@ -0,0 +1,48 @@
+// src/lib/entities/identifiers/names.test.ts
+import {describe,it,expect} from 'vitest';
+import {NAMES_VERSION,normalizeCompanyName} from './names';
+
+// 20 real A+H issuers: [A-side registered name, H-side list-style name].
+const SAME:[string,string][]=[
+ ['BYD Company Limited','BYD COMPANY LIMITED - H SHS'],
+ ['Weichai Power Co., Ltd.','WEICHAI POWER CO LTD - H'],
+ ['Ping An Insurance (Group) Company of China, Ltd.','PING AN INSURANCE (GROUP) COMPANY OF CHINA LTD (H)'],
+ ['China Merchants Bank Co., Ltd.','CHINA MERCHANTS BANK CO., LTD. - H SHS'],
+ ['Industrial and Commercial Bank of China Limited','INDUSTRIAL AND COMMERCIAL BANK OF CHINA LTD - H'],
+ ['China Construction Bank Corporation','CHINA CONSTRUCTION BANK CORP - H'],
+ ['Bank of China Limited','BANK OF CHINA LTD - H'],
+ ['PetroChina Company Limited','PETROCHINA CO LTD - H'],
+ ['China Petroleum & Chemical Corporation','CHINA PETROLEUM & CHEMICAL CORP - H'],
+ ['China Life Insurance Company Limited','CHINA LIFE INSURANCE CO LTD - H'],
+ ['Zijin Mining Group Co., Ltd.','ZIJIN MINING GROUP CO LTD - H'],
+ ['Anhui Conch Cement Company Limited','ANHUI CONCH CEMENT CO LTD - H'],
+ ['Tsingtao Brewery Company Limited','TSINGTAO BREWERY CO LTD - H'],
+ ['ZTE Corporation','ZTE CORP - H'],
+ ['Great Wall Motor Company Limited','GREAT WALL MOTOR CO LTD - H'],
+ ['China Shenhua Energy Company Limited','CHINA SHENHUA ENERGY CO LTD - H'],
+ ['Midea Group Co., Ltd.','MIDEA GROUP CO LTD - H'],
+ ['中国平安保险（集团）股份有限公司','中国平安保险(集团)股份有限公司'],
+ ['潍柴动力股份有限公司','潍柴动力'],
+ ['紫金矿业集团股份有限公司','紫金矿业'],
+];
+const DIFFERENT:[string,string][]=[
+ ['China Life Insurance Company Limited','China Pacific Insurance (Group) Co., Ltd.'],
+ ['Bank of China Limited','Bank of Communications Co., Ltd.'],
+ ['China Shenhua Energy Company Limited','China Coal Energy Company Limited'],
+ ['中国石油天然气股份有限公司','中国石油化工股份有限公司'],
+];
+
+describe('normalizeCompanyName',()=>{
+ it.each(SAME)('%s ≡ %s',(a,h)=>{
+  expect(normalizeCompanyName(a)).toBe(normalizeCompanyName(h));
+  expect(normalizeCompanyName(a)).not.toBe('');
+ });
+ it.each(DIFFERENT)('%s ≠ %s',(a,b)=>expect(normalizeCompanyName(a)).not.toBe(normalizeCompanyName(b)));
+ it('lower-cases, converts full width, strips punctuation and only trailing suffix words',()=>{
+  expect(normalizeCompanyName('Ping An Insurance (Group) Company of China, Ltd.')).toBe('pinganinsurancegroupcompanyofchina');
+  expect(normalizeCompanyName('ＢＹＤ　Ｃｏｍｐａｎｙ')).toBe('byd');
+  expect(normalizeCompanyName('Costco Wholesale Corp')).toBe('costcowholesale');
+  expect(normalizeCompanyName('Group Holdings Limited')).toBe('');
+  expect(NAMES_VERSION).toBe('company-names/1');
+ });
+});
diff --git a/src/lib/entities/identifiers/names.ts b/src/lib/entities/identifiers/names.ts
new file mode 100644
index 0000000..523c691
--- /dev/null
+++ b/src/lib/entities/identifiers/names.ts
@@ -0,0 +1,26 @@
+// src/lib/entities/identifiers/names.ts
+// Company-name normalization for the A+H name match (spec §4.2.2 rule 2). Pure and deliberately
+// narrow: two names match only when they are EQUAL after normalization (no fuzzy score). Steps:
+// NFKC (full width → half width), lower case, strip trailing H-share markers ("- H SHS", "-H",
+// "(H)") and trailing suffix words (Chinese 股份有限公司/有限公司/集团/控股; English
+// limited/ltd/co/company/corp/corporation/holdings/group/inc/plc, as whole words) until stable,
+// then drop all whitespace, punctuation and symbols.
+export const NAMES_VERSION='company-names/1';
+const ZH_SUFFIXES=['股份有限公司','有限公司','集团','控股'];
+const EN_SUFFIX=/(^|[^\p{L}\p{N}])(limited|ltd|co|company|corp|corporation|holdings|group|inc|plc)$/u;
+const H_MARKERS=[/\s*-\s*h\s*shs?\.?$/u,/\s*-\s*h$/u,/\s*\(h\)$/u];
+const TRAILING=/[\s\p{P}\p{S}]+$/u;
+
+export function normalizeCompanyName(name:string):string{
+ let s=name.normalize('NFKC').toLowerCase().trim();
+ for(;;){
+  const before=s;
+  for(const m of H_MARKERS)s=s.replace(m,'');
+  s=s.replace(TRAILING,'');
+  for(const z of ZH_SUFFIXES)if(s.endsWith(z))s=s.slice(0,-z.length);
+  const en=EN_SUFFIX.exec(s);
+  if(en)s=s.slice(0,s.length-en[2].length);
+  if(s===before)break;
+ }
+ return s.replace(/[\s\p{P}\p{S}]/gu,'');
+}
diff --git a/src/lib/entities/link-ah.test.ts b/src/lib/entities/link-ah.test.ts
new file mode 100644
index 0000000..5f3e871
--- /dev/null
+++ b/src/lib/entities/link-ah.test.ts
@@ -0,0 +1,112 @@
+// src/lib/entities/link-ah.test.ts
+import {describe,it,expect} from 'vitest';
+import {memoryTableClient} from '../db/memory-table-client';
+import type {FigiJob,FigiJobResult,FigiRecord} from './identifiers/openfigi';
+import {applyAhLinks,figiHitsFromResults,planAhLinks,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';
+
+const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.ah-link';
+const A='10000000-0000-4000-8000-0000000000a1',B='10000000-0000-4000-8000-0000000000b1',C='10000000-0000-4000-8000-0000000000c1';
+const LEI='529900T8BM49AURSDO55';
+const iss=(o:Partial<AhIssuer>):AhIssuer=>({issuer_id:A,lei:LEI,usci:null,names:['Weichai Power Co., Ltd.','潍柴动力股份有限公司'],aTickers:['000338.SZ'],hTickers:[],...o});
+const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
+const UNI=new Map([['02338.HK',{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}],['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
+const HK_ISIN=(code:string,isin='CNE1000004L9')=>[code,{isin,file:'isin_hkex' as const,sha256:'e'.repeat(64),row:7}] as const;
+const input=(o:Partial<AhLinkInput>={}):AhLinkInput=>({asOf:ASOF,issuers:[iss({})],figiHits:[hit()],universe:UNI,openOwner:new Map(),hkex:null,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('02899')]),...o});
+
+describe('planAhLinks · rule 1 (same LEI)',()=>{
+ it('attaches the HK line at its listing date as an H share with GLEIF/OpenFIGI/listing provenance',()=>{
+  const p=planAhLinks(input());
+  expect(p.attaches).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',share_class:'H',is_primary:false,valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',provenance:{
+   isin:{source:'gleif_openfigi',as_of:ASOF,evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0;hkex:isin_hkex:${'e'.repeat(64)}:row:7`},
+   figi:{source:'openfigi',as_of:ASOF,evidence_sha256:'c'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},level:'composite'},
+   valid_from:{source:'stocks_universe.list_date',provider:'tushare_hk_basic',as_of:ASOF,row:{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}},
+  }}]);
+  expect(p.claims).toEqual([]);
+ });
+ it('falls back to first_observed without a list date; share class unknown without A rows or USCI',()=>{
+  const p=planAhLinks(input({issuers:[iss({aTickers:[]})],figiHits:[hit({ticker:'02899.HK',figi:null,level:null})]}));
+  expect(p.attaches[0]).toMatchObject({ticker:'02899.HK',valid_from:ASOF,valid_from_method:'first_observed',share_class:'unknown',figi:null});
+  expect(Object.keys(p.attaches[0].provenance??{})).toEqual(['isin']);
+  expect(shareClassFor(iss({aTickers:[],usci:'91370000163446410B'}))).toBe('H');
+ });
+ it('quarantines a line owned by another issuer and skips issuers that already hold an H line',()=>{
+  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:{gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}}}));
+  expect(owned.attaches).toEqual([]);
+  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:`gleif/${'a'.repeat(64)}.csv`,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:`hkex/${'d'.repeat(64)}.xlsx`}},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
+  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_has_h']);
+  expect(planAhLinks(input({figiHits:[hit({ticker:'09999.HK'})],hkexIsins:new Map([HK_ISIN('09999')])})).skipped).toEqual(['ticker_not_in_universe']);
+ });
+ it('never links a co-mapped ticker that cannot be validated as the issuer\'s own line (Tencent: 00700.HK, 80700.HK, TCTZF)',()=>{
+  const U=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
+  const multi=[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})];
+  // HKEX ISIN match only for the real counter; the RMB counter has a different HKEX ISIN
+  const p=planAhLinks(input({universe:U,figiHits:multi,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
+  expect(p.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
+  expect(p.skipped).toEqual(['hkex_isin_mismatch']);
+  // no HKEX ISIN for the code and no ticker-level FIGI → unvalidated, nothing attached or quarantined
+  const none=planAhLinks(input({universe:U,figiHits:[hit({ticker:'80700.HK'})],hkexIsins:new Map(),openOwner:new Map([['80700.HK',B]])}));
+  expect([none.attaches,none.conflicts,none.claims]).toEqual([[],[],[]]);
+  expect(none.skipped).toEqual(['ticker_unvalidated']);
+ });
+ it('accepts a ticker-level FIGI equal to the ISIN-level FIGI when HKEX has no ISIN for the code',()=>{
+  const ok=planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000WEICH1']])}));
+  expect(ok.attaches).toHaveLength(1);
+  expect((ok.attaches[0].provenance as {isin:{locator:string}}).isin.locator).toContain('openfigi_ticker:BBG000WEICH1');
+  expect(planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000OTHER9']])})).skipped).toEqual(['ticker_unvalidated']);
+  expect(planAhLinks(input({hkexIsins:new Map(),figiHits:[hit({figi:null,level:null})],tickerFigi:new Map([['02338.HK','BBG000WEICH1']])})).skipped).toEqual(['ticker_unvalidated']);
+ });
+ it('rejects a non-equity HKEX category and ignores -OLD counters in the name match',()=>{
+  const row=(category:string,name='WEICHAI POWER CO LTD - H')=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:[{stockCode:'02338',name,category,isin:null,row:5}]});
+  expect(planAhLinks(input({hkex:row('Equity Warrants')})).skipped).toEqual(['name_match_none','not_equity']);
+  expect(planAhLinks(input({figiHits:[],hkex:row('Equity','WEICHAI POWER CO LTD - H-OLD')})).skipped).toEqual(['name_match_none']);
+ });
+});
+
+describe('planAhLinks · rule 2 (HKEX name match)',()=>{
+ const hkex=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
+ it('files one attach_security claim (name_match) for exactly one equal Equity name',()=>{
+  const p=planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02339',name:'WEICHAI POWER CO LTD - H',category:'Debt Securities'}])}));
+  expect(p.attaches).toEqual([]);
+  expect(p.claims).toHaveLength(1);
+  expect(p.claims[0]).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',source:'hkex_list_name_match',op:'attach_security',detail:{
+   schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:A},
+   params:{ticker:'02338.HK',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'hkex_list_name_match'},
+   evidence:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'},
+  }});
+ });
+ it('files nothing for zero or several matches, for issuers without A rows, or when rule 1 already linked',()=>{
+  const two=hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02340',name:'Weichai Power Co Ltd',category:'Equity'}]);
+  expect(planAhLinks(input({figiHits:[],hkex:two})).skipped).toEqual(['name_match_multiple']);
+  expect(planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'00700',name:'TENCENT',category:'Equity'}])})).skipped).toEqual(['name_match_none']);
+  expect(planAhLinks(input({figiHits:[],issuers:[iss({aTickers:[]})],hkex:two})).claims).toEqual([]);
+  expect(planAhLinks(input({hkex:two})).claims).toEqual([]);
+ });
+});
+
+describe('figiHitsFromResults',()=>{
+ it('keeps HK candidates of each issuer LEI, with a FIGI only when exactly one group exists',()=>{
+  const rec=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000WEICH1',compositeFIGI:'BBG000WEICH1',ticker:'2338',exchCode:'HK',securityType:'Common Stock',marketSector:'Equity',...o});
+  const job:FigiJob={idType:'ID_ISIN',idValue:'CNE1000004L9'};
+  const results=new Map<string,FigiJobResult>([['CNE1000004L9',{job,status:'ok',records:[rec({}),rec({ticker:'000338',exchCode:'CS',figi:'BBG000WEICH2',compositeFIGI:'BBG000WEICH2'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:3}}]]);
+  const hits=figiHitsFromResults([iss({})],{sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])},results);
+  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
+ });
+});
+
+describe('applyAhLinks',()=>{
+ it('attaches, quarantines and files claims once; a replay is a duplicate',async()=>{
+  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  await c.insert('issuer_securities',{issuer_id:B,ticker:'02899.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
+  const plan=planAhLinks(input({issuers:[iss({}),iss({issuer_id:C,lei:null,names:['Zijin Mining Group Co., Ltd.'],aTickers:['601899.SH']})],
+   figiHits:[hit(),hit({issuer_id:A,ticker:'02899.HK'})],openOwner:new Map([['02899.HK',B]]),
+   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]}}));
+  const res=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
+  expect(c.rows('issuer_securities').find(r=>r.ticker==='02338.HK')).toMatchObject({issuer_id:A,share_class:'H',valid_from_method:'listing_date'});
+  expect(c.rows('dq_quarantine').map(q=>[q.natural_key,q.reason_code])).toEqual([[`02899.HK:${ASOF}`,'ownership_conflict']]);
+  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
+  expect(res.claims).toEqual({});
+  expect(res.skippedSummary).toEqual({name_match_owned:1});
+  const again=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
+  expect(again.counts).toMatchObject({inserted:0,duplicates:1});
+ });
+});
diff --git a/src/lib/entities/link-ah.ts b/src/lib/entities/link-ah.ts
new file mode 100644
index 0000000..3685ef1
--- /dev/null
+++ b/src/lib/entities/link-ah.ts
@@ -0,0 +1,173 @@
+// src/lib/entities/link-ah.ts
+// A+H linking (spec §4.2.2). Rule 1 (automatic, hard_identifier): an issuer's LEI → GLEIF ISINs →
+// OpenFIGI HK line that is in stocks_universe and held by nobody → attachSecurity at the listing
+// date (listing_date) or the run date (first_observed); held by another issuer → ownership_conflict.
+// Rule 2 (claims only, name_match): an issuer holding A-share rows, no H row and a name, whose
+// normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
+// only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
+// waits for a confirmed source (spec §14-1).
+// OpenFIGI hints are never trusted on their own: one ISIN can map to several tickers (Tencent:
+// 00700.HK, 80700.HK, TCTZF), so a returned HK ticker is attached automatically only when it is
+// validated as this issuer's own line — HKEX stock code + ISIN match, or (when HKEX has no ISIN for
+// the code) a ticker-level FIGI equal to the ISIN-level FIGI. Anything else is skipped, not claimed.
+import type {TableClient} from '../db/table-client';
+import {emptyCounts,type BatchError} from '../dq/batches';
+import {fileClaim,type ClaimInput} from './claims';
+import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
+import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
+import {groupFigiResults,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
+import {rawPath} from '../dq/raw-store';
+import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
+import {sanitizeProvenance} from './provenance';
+import {attachSecurity} from './securities';
+import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';
+
+/** HKEX list Category value for ordinary equity, compared lower-cased (Task 3a verification). */
+export const HKEX_EQUITY_CATEGORY='equity';
+export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
+export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;responseSha256:string;index:number;lei:string}
+export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
+export interface AhLinkInput{
+ asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
+ universe:ReadonlyMap<string,UniverseListing>;
+ /** ticker → issuer_id of its open row */
+ openOwner:ReadonlyMap<string,string>;
+ hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
+ /** 5-digit stock code → ISIN (mergeHkexIsins); validation source #1 for rule 1 */
+ hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
+ /** HK ticker → FIGI from a ticker-level OpenFIGI lookup; validation source #2 when HKEX has no ISIN for the code */
+ tickerFigi?:ReadonlyMap<string,string>;
+ /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
+ raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
+}
+export interface AhLinkPlan{attaches:IssuerSecurityInput[];conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[]}
+
+type Validated='hkex_isin'|'ticker_figi';
+/** Is this OpenFIGI-returned HK ticker verifiably the issuer's own line? Otherwise the skip reason. */
+function validateHit(h:AhFigiHit,input:AhLinkInput):{ok:true;by:Validated;locator:string}|{ok:false;reason:string}{
+ const code=h.ticker.slice(0,5);
+ const row=input.hkex?.rows.find(r=>r.stockCode===code&&!SUPERSEDED.test((r.name??'').trim()));
+ if(row&&row.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY)return {ok:false,reason:'not_equity'};
+ const k=input.hkexIsins?.get(code);
+ if(k)return k.isin===h.isin?{ok:true,by:'hkex_isin',locator:`hkex:${k.file}:${k.sha256}:row:${k.row}`}:{ok:false,reason:'hkex_isin_mismatch'};
+ const tf=input.tickerFigi?.get(h.ticker);
+ if(tf&&h.figi&&tf===h.figi)return {ok:true,by:'ticker_figi',locator:`openfigi_ticker:${tf}`};
+ return {ok:false,reason:'ticker_unvalidated'};
+}
+const SUPERSEDED=/-\s*old$/i;
+export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';
+
+/** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
+export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
+ const out:AhFigiHit[]=[];
+ for(const i of issuers){
+  if(!i.lei)continue;
+  for(const isin of gleif.byLei.get(i.lei)??[]){
+   const r=results.get(isin);
+   if(!r||r.status!=='ok')continue;
+   for(const c of groupFigiResults(r.records).candidates){
+    if(c.market!=='HK')continue;
+    const one=c.groups.length===1?c.groups[0]:null;
+    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
+   }
+  }
+ }
+ return out;
+}
+
+function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
+ if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
+ return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
+}
+const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
+
+export function planAhLinks(input:AhLinkInput):AhLinkPlan{
+ const plan:AhLinkPlan={attaches:[],conflicts:[],claims:[],skipped:[]};
+ const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
+ const linked=new Set<string>();const seen=new Set<string>();
+ for(const h of input.figiHits){
+  const i=byId.get(h.issuer_id);
+  if(!i)continue;
+  if(i.hTickers.length){plan.skipped.push('already_has_h');continue;}
+  const k=`${h.issuer_id}|${h.ticker}`;
+  if(seen.has(k))continue;
+  seen.add(k);
+  const u=input.universe.get(h.ticker);
+  if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
+  const v=validateHit(h,input);
+  if(!v.ok){plan.skipped.push(v.reason);continue;}
+  const owner=input.openOwner.get(h.ticker);
+  if(owner===h.issuer_id){plan.skipped.push('already_attached');linked.add(h.issuer_id);continue;}
+  if(owner!==undefined){
+   const g=input.raw?.gleif,hk=input.raw?.hkex;
+   plan.conflicts.push({naturalKey:`${h.ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,validated_by:v.by,
+    evidence:{gleif_sha256:h.gleifSha256,...(g?{gleif_path:g.path}:{}),openfigi_response_sha256:h.responseSha256,openfigi_path:rawPath('openfigi',h.responseSha256,'json'),...(hk?{hkex_sha256:hk.sha256,hkex_path:hk.path}:{})}},
+    payload:{issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin}});
+   continue;
+  }
+  const l=listing(u,input.asOf);
+  const provenance=sanitizeProvenance({
+   isin:{source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index};${v.locator}`},
+   ...(h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:h.responseSha256,job:jobOf(h.job),level:h.level}}:{}),
+   ...l.prov,
+  });
+  plan.attaches.push({issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin,figi:h.figi,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
+  linked.add(h.issuer_id);
+ }
+ if(input.hkex){
+  const hk=input.hkex;
+  const byName=new Map<string,HkexListRow[]>();
+  for(const r of hk.rows){
+   if(r.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY||!r.name||SUPERSEDED.test(r.name.trim()))continue;
+   const n=normalizeCompanyName(r.name);
+   if(!n)continue;
+   byName.set(n,[...(byName.get(n)??[]),r]);
+  }
+  for(const i of input.issuers){
+   if(linked.has(i.issuer_id)||i.aTickers.length===0||i.hTickers.length>0)continue;
+   const names=new Set(i.names.map(normalizeCompanyName).filter(n=>n!==''));
+   if(!names.size){plan.skipped.push('name_match_no_name');continue;}
+   const codes=new Map<string,HkexListRow>();
+   for(const n of names)for(const r of byName.get(n)??[])codes.set(r.stockCode,r);
+   if(codes.size!==1){plan.skipped.push(codes.size?'name_match_multiple':'name_match_none');continue;}
+   const row=[...codes.values()][0];
+   const ticker=`${row.stockCode}.HK`;
+   const u=input.universe.get(ticker);
+   if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
+   const owner=input.openOwner.get(ticker);
+   if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
+   const l=listing(u,input.asOf);
+   const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
+   plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
+    schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
+    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
+    evidence,sources:[evidence],...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
+   }});
+  }
+ }
+ plan.skipped.sort();
+ return plan;
+}
+
+export async function applyAhLinks(tables:TableClient,plan:AhLinkPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult&{claims:Record<string,number>}>{
+ const counts=emptyCounts();const errors:BatchError[]=[];const claims:Record<string,number>={};
+ const park=(naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode:'ownership_conflict',detail,payload,batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:naturalKey});
+ for(const a of plan.attaches){
+  try{
+   const res=await attachSecurity(tables,a);
+   if(res==='inserted')counts.inserted++;
+   else if(res==='duplicate')counts.duplicates++;
+   else await park(`${a.ticker}:${a.valid_from}`,{reason:'ticker_owned_by_other_issuer',rule:'same_lei'},{issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
+  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:a.ticker,message:errorMessage(e)});}
+ }
+ for(const x of plan.conflicts)await park(x.naturalKey,x.detail,x.payload);
+ for(const c of plan.claims){
+  try{const created=await fileClaim(tables,c);const k=created?c.op:`${c.op}_appended`;claims[k]=(claims[k]??0)+1;}
+  catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.value}`,message:errorMessage(e)});}
+ }
+ counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
+ const skippedSummary:Record<string,number>={};
+ for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
+ const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
+ return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
+}
cat: AGENTS.md: No such file or directory

exec
/bin/zsh -lc 'for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude; do ls "$d"/AGENTS* 2>/dev/null; done; cat src/lib/entities/securities.ts; cat src/lib/dq/batches.ts; cat src/lib/entities/identifiers/openfigi.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
zsh:1: no matches found: /Volumes/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS*
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
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
// src/lib/entities/identifiers/openfigi.ts
// Stage B/C (spec §4.1.2–§4.1.3): OpenFIGI v3 mapping adapter. mapJobs throttles to 80% of the
// documented limits (no key: 25 requests/min and 10 jobs/request; key: 250/min and 100 jobs),
// backs off BACKOFF_MS once on 429/5xx/network failure and then gives up the rest of the run
// (exhausted → the caller records quota_exhausted). Each request's job array and the exact
// response bytes go to reconcile-raw; the API key travels only in a header and is never stored.
// groupFigiResults is pure: equity filter, EXCH_MAP, grouping by compositeFIGI (composite level)
// or figi (venue level), sorted so the order of API results never changes the outcome. No venue
// preference is invented: several groups for one ticker means "do not write, file claims".
import type {Budget} from '../../facts/types';
import {PacerError,createPacer,sleep as abortableSleep,type Pacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeSecurityTicker} from '../../securities/ticker';

export const OPENFIGI_URL='https://api.openfigi.com/v3/mapping';
export const OPENFIGI_VERSION='v3';
export const EXCH_MAP_VERSION='exch-map/1';
/** True only after the Task 3b live check (verification.md). fill-identifiers/link-ah --apply refuse while false. */
export const EXCH_MAP_VERIFIED:boolean=true;
/** openfigi.com/about/exchange-codes. CG→.SH, CS→.SZ, CH (China composite) by code prefix (6/9→.SH, 0/3→.SZ). */
export const EXCH_MAP:Readonly<Record<string,'US'|'SH'|'SZ'|'CH'|'HK'>>={US:'US',UN:'US',UW:'US',UA:'US',UR:'US',UP:'US',UQ:'US',CG:'SH',CS:'SZ',CH:'CH',HK:'HK'};
/** Spec §4.1.2 set; extend only with values observed in the live check (contract issue 1). */
export const ALLOWED_SECURITY_TYPES:ReadonlySet<string>=new Set(['Common Stock','ADR','GDR']);
export const BACKOFF_MS=60_000;
const FIGI=/^BBG[A-Z0-9]{9}$/;

export type FigiMarket='US'|'CN'|'HK';
export interface FigiJob{idType:'ID_ISIN'|'TICKER';idValue:string;exchCode?:string}
export interface FigiRecord{figi:string;compositeFIGI?:string|null;ticker?:string|null;exchCode?:string|null;securityType?:string|null;securityType2?:string|null;marketSector?:string|null;name?:string|null;shareClassFIGI?:string|null}
export interface FigiEvidence{request_sha256:string;response_sha256:string;index:number}
export type FigiJobResult=
 |{job:FigiJob;status:'ok';records:FigiRecord[];evidence:FigiEvidence}
 |{job:FigiJob;status:'not_found'|'error';message:string;evidence:FigiEvidence};
export interface FigiFailure{status:number|null;request_sha256:string;response_sha256:string|null;error?:'body_read_failed'}
export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
/** Shared pacing state for one quota identity: the landed serialized pacer plus a back-off horizon every caller honours. */
export interface FigiLimiter{pacer:Pacer;blockedUntil:number}
export const createFigiLimiter=():FigiLimiter=>({pacer:createPacer(3000),blockedUntil:-Infinity});
export interface OpenFigiDeps{fetch:typeof fetch;raw:RawStore;apiKey?:string|null;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;budget?:Budget;
 /** Cleanup reserve kept free of back-off waits (default 0). */reserveMs?:number;
 /** Default: one process-wide limiter per quota identity (key vs no key), shared by all mapJobs calls. Tests inject their own for isolation. */limiter?:FigiLimiter}
export class OpenFigiError extends Error{
 constructor(readonly code:'invalid_schema'|'openfigi_http'|'budget_aborted',detail?:string,readonly evidence?:FigiFailure){super(detail?`${code}: ${detail}`:code);this.name='OpenFigiError';}
}

export function openFigiLimits(apiKey?:string|null):{jobsPerRequest:number;minIntervalMs:number}{
 const keyed=!!apiKey;
 const perMinute=Math.floor((keyed?250:25)*0.8);
 return {jobsPerRequest:keyed?100:10,minIntervalMs:Math.ceil(60_000/perMinute)};
}

function parseItem(job:FigiJob,item:unknown,evidence:FigiEvidence):FigiJobResult{
 if(!item||typeof item!=='object'||Array.isArray(item))throw new OpenFigiError('invalid_schema','job result');
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

exec
/bin/zsh -lc "cat /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; cat src/lib/entities/identifiers/gleif.ts; cat src/lib/entities/provenance.ts; rg -n 'provenance_written|attach_security' src/lib/entities/claims.ts src/lib/entities/*claim*; find . -name '*AGENTS*' -o -name CLAUDE.md; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 38ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/entities/identifiers/gleif.ts
// Stage A (spec §4.1.1): GLEIF ISIN↔LEI mapping (`LEI,ISIN` CSV, public domain). The ~300 MB file
// is pre-filtered line by line (filterGleifLines) and the kept lines go through the landed
// selectIsinsForLeis, which validates the header (invalid_schema). The subset is rendered
// deterministically (sorted, deduplicated, check-digit valid) so its sha256 is stable evidence for
// reconcile-raw. Bond ISINs are kept here: stage B (OpenFIGI) judges the security type.
import {createHash} from 'node:crypto';
import {selectIsinsForLeis} from '../../research/entity-keys/parsers';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const GLEIF_HEADER='LEI,ISIN';
export const GLEIF_URL='https://mapping.gleif.org/api/v2/isin-lei/latest/download';
export interface GleifSubset{csv:string;sha256:string;byLei:Map<string,string[]>;missing:string[];invalidIsins:string[]}

const stripBom=(s:string)=>s.charCodeAt(0)===0xfeff?s.slice(1):s;

/** Streams the file, yielding the header (BOM/CR stripped) and the lines whose LEI is wanted. */
export async function* filterGleifLines(lines:AsyncIterable<string>,leis:ReadonlySet<string>):AsyncGenerator<string>{
 let first=true;
 for await(const raw of lines){
  const line=raw.replace(/\r$/,'');
  if(first){first=false;yield stripBom(line);continue;}
  const comma=line.indexOf(',');
  if(comma>0&&leis.has(line.slice(0,comma)))yield line;
 }
}

/** Header + candidate lines → validated subset. Throws invalid_schema (landed parser) on a wrong or missing header.
 * A LEI whose every ISIN fails the check digit has no usable ISIN: it is absent from byLei, listed in `missing`, and its bad rows are in `invalidIsins`. */
export function subsetForLeis(lines:Iterable<string>,leis:ReadonlySet<string>):GleifSubset{
 const {found}=selectIsinsForLeis(lines,new Set(leis));
 const byLei=new Map<string,string[]>();
 const invalidIsins:string[]=[];
 for(const lei of Object.keys(found).sort()){
  const isins=[...new Set(found[lei].map(s=>s.trim().toUpperCase()))].sort().filter(i=>{
   if(isValidIsin(i))return true;
   invalidIsins.push(`${lei},${i}`);return false;
  });
  if(isins.length)byLei.set(lei,isins);
 }
 const csv=[GLEIF_HEADER,...[...byLei].flatMap(([lei,isins])=>isins.map(i=>`${lei},${i}`))].join('\n')+'\n';
 return {csv,sha256:createHash('sha256').update(csv,'utf8').digest('hex'),byLei,missing:[...leis].filter(l=>!byLei.has(l)).sort(),invalidIsins:invalidIsins.sort()};
}

/** Replays a stored subset (every LEI in it). */
export function parseGleifCsv(csv:string):Map<string,string[]>{
 const lines=stripBom(csv).split('\n').map(l=>l.replace(/\r$/,'')).filter((l,i)=>i===0||l!=='');
 const leis=new Set(lines.slice(1).map(l=>{const c=l.indexOf(',');return c<0?l:l.slice(0,c);}));
 return subsetForLeis(lines,leis).byLei;
}
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
src/lib/entities/claims.ts:26:const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
src/lib/entities/claims.ts:49:/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
src/lib/entities/claims.ts:52: if(op==='attach_security')return ['isin','figi','valid_from'];
src/lib/entities/claims.ts:75: if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
src/lib/entities/claims.ts:92:  case 'attach_security':
src/lib/entities/claims.ts:115: if(detail.provenance_written!==undefined){
src/lib/entities/claims.ts:116:  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
src/lib/entities/claims.ts:117:  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
src/lib/entities/claims.ts:120:  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
src/lib/entities/claims.ts:142:export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
src/lib/entities/claims.ts:144:  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
src/lib/entities/claims.test.ts:33:   ['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',ticker:'0700.HK'},provenance_written:{valid_from:{source:'x'}}})],
src/lib/entities/claims.test.ts:34:   ['attach_security','ticker',d({evidence_kind:'name_match',params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'hkex_list_name_match',isin:'CNE1000003G1'}})],
src/lib/entities/claims.test.ts:58:   [['attach_security','ticker',d({target:rowT})],'invalid_claim:op_id_type'],
src/lib/entities/claims.test.ts:59:   [['attach_security','ticker',d({params:{share_class:'B',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x'}})],'invalid_claim:params'],
src/lib/entities/claims.test.ts:60:   [['attach_security','ticker',d({params:{share_class:'H',valid_from:'2004-06-16',valid_from_method:'listing_date',source:'x',isin:'CN12'}})],'invalid_claim:params'],
src/lib/entities/claims.test.ts:67:   [['evidence_only','ticker',d({params:{suggested_op:['attach_security']}})],'invalid_claim:params.suggested_op'],
src/lib/entities/claims.test.ts:69:   [['set_identifier','lei',d({provenance_written:{cik:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
src/lib/entities/claims.test.ts:70:   [['set_identifier','lei',d({provenance_written:{lei:{source:'x',user_id:'u'}}})],'invalid_claim:provenance_written:secret_key'],
src/lib/entities/claims.test.ts:71:   [['evidence_only','ticker',d({provenance_written:{valid_from:{source:'x'}}})],'invalid_claim:provenance_written:unknown_key'],
src/lib/entities/claims.test.ts:72:   [['set_identifier','lei',d({provenance_written:{}})],'invalid_claim:provenance_written'],
src/lib/entities/claims.test.ts:73:   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x',ticker:'bad ticker'}})],'invalid_claim:params'],
src/lib/entities/claims.test.ts:74:   [['attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'}}),'a b'],'invalid_claim:params.ticker'],
src/lib/entities/claims.test.ts:81:  expect(provenanceKeysFor('attach_security','ticker')).toEqual(['isin','figi','valid_from']);
src/lib/entities/claims.test.ts:85:  expect(verdict(validateClaimDetail('attach_security','ticker',d({params:{share_class:'A',valid_from:'2001-08-27',valid_from_method:'listing_date',source:'x'},provenance_written:{valid_from:{source:'stocks_universe.list_date',as_of:'2026-11-05'}}})))).toBe('ok');
src/lib/entities/claims.test.ts:102:  expect(buildClaimDetail({evidence_kind:'provider_mapping',target:rowT,params:{candidates:[]},evidence:EV,provenance_written:{isin:{source:'gleif'}}})).toMatchObject({params:{candidates:[]},provenance_written:{isin:{source:'gleif'}}});
src/lib/entities/claims.ts:26:const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
src/lib/entities/claims.ts:49:/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
src/lib/entities/claims.ts:52: if(op==='attach_security')return ['isin','figi','valid_from'];
src/lib/entities/claims.ts:75: if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
src/lib/entities/claims.ts:92:  case 'attach_security':
src/lib/entities/claims.ts:115: if(detail.provenance_written!==undefined){
src/lib/entities/claims.ts:116:  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
src/lib/entities/claims.ts:117:  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
src/lib/entities/claims.ts:120:  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
src/lib/entities/claims.ts:142:export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
src/lib/entities/claims.ts:144:  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
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
/bin/zsh -lc "rg -n \"market:.*HK|market.*'HK'|loaderOutcome\" scripts/entity-keys src/lib/entities/load-sec.ts; cat src/lib/entities/identifiers/hkex-list.ts | tail -85; rg -n '4.2.2|A\\+H' docs/spec* docs/plans/* 2>/dev/null | head -25; nl -ba src/lib/entities/link-ah.ts | sed -n '84,105p'; rg -n 'name|Name' src/lib/entities/identifiers/hkex-list.ts | head -25" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/load-sec.ts:93:export function loaderOutcome(status:BatchStatus,counts:BatchCounts,rejected:Record<string,number>={}):{ok:boolean;exitCode:0|1}{
scripts/entity-keys/load-sec-issuers.ts:24:import {SEC_DATASET,applySecLoad,checkSnapshot,detectTickerChanges,errorMessage,lastSeenInReceipts,loaderOutcome,planSecLoad,priorSnapshots,recordRefusal} from '../../src/lib/entities/load-sec';
scripts/entity-keys/load-sec-issuers.ts:131: const outcome=loaderOutcome(status,counts,rejected);
scripts/entity-keys/backfill-windows.ts:29: for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))
scripts/entity-keys/link-research-entities.ts:28:import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
scripts/entity-keys/link-research-entities.ts:86: const outcome=loaderOutcome(status,counts,rejected);
scripts/entity-keys/link-ah.ts:25:import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
scripts/entity-keys/link-ah.ts:54: const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
scripts/entity-keys/link-ah.ts:90:    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
scripts/entity-keys/link-ah.ts:119: const outcome=loaderOutcome(status,counts);
scripts/entity-keys/fill-identifiers.ts:28:import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
scripts/entity-keys/fill-identifiers.ts:194: const outcome=loaderOutcome(status,counts);
scripts/entity-keys/coverage.ts:40: for(const market of ['A','HK'])for(const r of await selectAll(tables,'stocks_universe',{market},'ticker'))listDates.set(String(r.ticker),typeof r.list_date==='string'?r.list_date:null);
scripts/entity-keys/fill-cninfo-org-id.ts:17:import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
scripts/entity-keys/fill-cninfo-org-id.ts:59: const outcome=loaderOutcome(status,counts);
scripts/entity-keys/sec-submissions.ts:16:import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
scripts/entity-keys/sec-submissions.ts:77: const outcome=loaderOutcome(status,counts);
/** Expected file names inside `--hkex <dir>`; Task 4b stores each under its own `contentType` (the two ISIN workbooks are legacy OLE .xls). URLs and file names verified 2026-11-05 (docs/audits/2026-11-05-data-foundation-3/verification.md). */
export const HKEX_LIST_FILES:readonly HkexListFile[]=[
 {id:'list_of_securities',file:'ListOfSecurities.xlsx',contentType:XLSX_MIME,url:'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx',priority:1},
 {id:'isin_hkex',file:'isinsehk.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-HKEX/isinsehk.xls',priority:2},
 {id:'isin_other_agencies',file:'isino.xls',contentType:XLS_MIME,url:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Trading/Securities/Securities-Lists/ISINs-assigned-by-Other-Numbering-Agencies/isino.xls',priority:3},
];
export interface HkexListRow{stockCode:string;name:string|null;category:string|null;isin:string|null;row:number}
export interface HkexListParse{
 file:HkexFileId;sha256:string;headerRow:number;
 columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
 rows:HkexListRow[];rejected:{row:number;reason:'invalid_stock_code'|'invalid_isin'}[];
 skipped:{row:number;reason:'non_data'}[];   // legend/footer text: neither a stock code nor an ISIN (not a defect)
}
export interface HkexIsin{isin:string;file:HkexFileId;sha256:string;row:number}

const norm=(v:unknown)=>v==null?'':String(v).replace(/\s+/g,' ').trim().toLowerCase();
/** ListOfSecurities.xlsx says "Stock Code"; the two ISIN workbooks (verified 2026-11-05) say "HK Stock Code". */
const isCodeHeader=(h:string)=>h==='stock code'||h==='hk stock code';
/** HKEX writes these where a counter has no ISIN yet (isino.xls: "Not Available"); they mean "none", not a malformed value. */
const PLACEHOLDER_ISIN=new Set(['','not available','n/a','na','-','--','nil']);
const ISIN_SHAPE=/^[A-Z]{2}[A-Z0-9]{9}\d$/;
const text=(v:unknown)=>v==null||String(v).trim()===''?null:String(v).trim();

export function parseHkexList(bytes:Uint8Array,file:HkexFileId):HkexListParse{
 let grid:unknown[][];
 try{
  // nodim: the live HKEX file declares a stale <dimension> (A1:R8 for 17k rows), which would truncate the grid.
  const wb=XLSX.read(bytes,{type:'array',nodim:true} as XLSX.ParsingOptions);
  const ws=wb.Sheets[wb.SheetNames[0]];
  if(!ws)throw new Error('no sheet');
  grid=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,raw:false,defval:null,blankrows:true});
 }catch{throw new Error('invalid_schema');}
 const headerIdx=grid.slice(0,30).findIndex(r=>Array.isArray(r)&&r.some(c=>isCodeHeader(norm(c))));
 if(headerIdx<0)throw new Error('invalid_schema');
 const header=(grid[headerIdx] as unknown[]).map(norm);
 const find=(pred:(h:string)=>boolean)=>{const i=header.findIndex(pred);return i<0?null:i;};
 const columns={
  stockCode:header.findIndex(isCodeHeader),
  name:find(h=>h==='name of securities'||h==='name of security'||h==='name'||h==='stocks'),
  category:find(h=>h==='category'),
  isin:find(h=>h.startsWith('isin')),
 };
 const rows:HkexListRow[]=[];
 const rejected:HkexListParse['rejected']=[];
 const skipped:HkexListParse['skipped']=[];
 for(let i=headerIdx+1;i<grid.length;i++){
  const r=grid[i];
  if(!Array.isArray(r)||r.every(c=>text(c)===null))continue;
  const code=text(r[columns.stockCode])??'';
  if(isCodeHeader(norm(code)))continue;   // the ISIN workbooks repeat the header above their second table
  const cell=(c:number|null)=>c===null?null:text(r[c]);
  let isin=cell(columns.isin)?.toUpperCase()??null;
  if(isin!==null&&PLACEHOLDER_ISIN.has(norm(isin)))isin=null;
  if(!/^\d{1,5}$/.test(code)){
   // No code and no ISIN-shaped value (live isino.xls ends with an agency legend table): legend / footer text, not a data row. A bad code beside a real ISIN is still a defect.
   if(isin===null||!ISIN_SHAPE.test(isin))skipped.push({row:i+1,reason:'non_data'});else rejected.push({row:i+1,reason:'invalid_stock_code'});
   continue;
  }
  if(isin!==null&&!isValidIsin(isin)){rejected.push({row:i+1,reason:'invalid_isin'});isin=null;}
  rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
 }
 return {file,sha256:createHash('sha256').update(bytes).digest('hex'),headerRow:headerIdx+1,columns,rows,rejected,skipped};
}

/** Stock code → ISIN by file priority (first file wins); a different ISIN in a later file is listed in conflicts. */
export interface HkexDropped{stockCode:string;file:HkexFileId;row:number;name:string;reason:'superseded_counter'}
/** A name ending "-OLD" marks a superseded parallel-trading counter (e.g. 02947 BEIJING DEEPZERO TECH CO., LTD.-OLD); it never supplies an ISIN. */
const SUPERSEDED=/-\s*old$/i;
export function mergeHkexIsins(parses:readonly HkexListParse[]):{byCode:Map<string,HkexIsin>;dropped:HkexDropped[];conflicts:{stockCode:string;isins:{file:HkexFileId;isin:string}[]}[];hasIsinColumn:boolean}{
 const prio=(f:HkexFileId)=>HKEX_LIST_FILES.find(x=>x.id===f)!.priority;
 const ordered=[...parses].sort((a,b)=>prio(a.file)-prio(b.file));
 const byCode=new Map<string,HkexIsin>();
 const seen=new Map<string,{file:HkexFileId;isin:string}[]>();
 const dropped:HkexDropped[]=[];
 for(const p of ordered)for(const r of p.rows){
  if(!r.isin)continue;
  if(r.name&&SUPERSEDED.test(r.name.trim())){dropped.push({stockCode:r.stockCode,file:p.file,row:r.row,name:r.name,reason:'superseded_counter'});continue;}
  const list=seen.get(r.stockCode)??[];
  if(!list.some(x=>x.isin===r.isin))list.push({file:p.file,isin:r.isin});
  seen.set(r.stockCode,list);
  if(!byCode.has(r.stockCode))byCode.set(r.stockCode,{isin:r.isin,file:p.file,sha256:p.sha256,row:r.row});
 }
 const conflicts=[...seen].filter(([,l])=>l.length>1).map(([stockCode,isins])=>({stockCode,isins})).sort((a,b)=>a.stockCode<b.stockCode?-1:1);
 return {byCode,dropped,conflicts,hasIsinColumn:parses.some(p=>p.columns.isin!==null)};
}
zsh:1: no matches found: docs/spec*
    84	export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    85	 const plan:AhLinkPlan={attaches:[],conflicts:[],claims:[],skipped:[]};
    86	 const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
    87	 const linked=new Set<string>();const seen=new Set<string>();
    88	 for(const h of input.figiHits){
    89	  const i=byId.get(h.issuer_id);
    90	  if(!i)continue;
    91	  if(i.hTickers.length){plan.skipped.push('already_has_h');continue;}
    92	  const k=`${h.issuer_id}|${h.ticker}`;
    93	  if(seen.has(k))continue;
    94	  seen.add(k);
    95	  const u=input.universe.get(h.ticker);
    96	  if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
    97	  const v=validateHit(h,input);
    98	  if(!v.ok){plan.skipped.push(v.reason);continue;}
    99	  const owner=input.openOwner.get(h.ticker);
   100	  if(owner===h.issuer_id){plan.skipped.push('already_attached');linked.add(h.issuer_id);continue;}
   101	  if(owner!==undefined){
   102	   const g=input.raw?.gleif,hk=input.raw?.hkex;
   103	   plan.conflicts.push({naturalKey:`${h.ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,validated_by:v.by,
   104	    evidence:{gleif_sha256:h.gleifSha256,...(g?{gleif_path:g.path}:{}),openfigi_response_sha256:h.responseSha256,openfigi_path:rawPath('openfigi',h.responseSha256,'json'),...(hk?{hkex_sha256:hk.sha256,hkex_path:hk.path}:{})}},
   105	    payload:{issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin}});
2:// Stage D (spec §4.1.4): HKEX securities lists → (stock code, name, category, ISIN). Columns are
4:// to ListOfSecurities.xlsx). A file without an ISIN column still yields names and categories, which
5:// the A+H name match uses (§4.2.2). ISIN precedence follows HKEX_LIST_FILES priority.
14:/** Expected file names inside `--hkex <dir>`; Task 4b stores each under its own `contentType` (the two ISIN workbooks are legacy OLE .xls). URLs and file names verified 2026-11-05 (docs/audits/2026-11-05-data-foundation-3/verification.md). */
20:export interface HkexListRow{stockCode:string;name:string|null;category:string|null;isin:string|null;row:number}
23: columns:{stockCode:number;name:number|null;category:number|null;isin:number|null};
42:  const ws=wb.Sheets[wb.SheetNames[0]];
52:  name:find(h=>h==='name of securities'||h==='name of security'||h==='name'||h==='stocks'),
73:  rows.push({stockCode:code.padStart(5,'0'),name:cell(columns.name),category:cell(columns.category),isin,row:i+1});
79:export interface HkexDropped{stockCode:string;file:HkexFileId;row:number;name:string;reason:'superseded_counter'}
80:/** A name ending "-OLD" marks a superseded parallel-trading counter (e.g. 02947 BEIJING DEEPZERO TECH CO., LTD.-OLD); it never supplies an ISIN. */
90:  if(r.name&&SUPERSEDED.test(r.name.trim())){dropped.push({stockCode:r.stockCode,file:p.file,row:r.row,name:r.name,reason:'superseded_counter'});continue;}

codex
The planner can discard valid linking evidence through premature deduplication and can automatically attach known superseded counters through its fallback validation.

Full review comments:

- [P2] Deduplicate ticker hits only after validating their evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:92-98
  When multiple ISINs for one LEI map to the same HK ticker, the first hit marks the issuer/ticker pair as seen before validation. If that hit fails the HKEX ISIN check but a later hit matches, the valid hit is silently discarded, so an eligible automatic attachment is missed. This is especially relevant to the co-mapped tickers this change explicitly handles. Validate each hit before deduplicating successful candidates, and add a regression test with an invalid hit preceding a valid one.

- [P2] Reject superseded counters before attempting fallback validation — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:49-54
  When an HKEX row is marked `-OLD`, filtering it out of the lookup makes it indistinguishable from a missing row rather than rejecting the counter. Since `mergeHkexIsins` also drops superseded rows, the CLI then requests ticker-level FIGI validation, which can authorize attaching that obsolete counter if it remains in `stocks_universe`. Explicitly reject known superseded counters before either validation path instead of allowing the fallback to bypass this evidence.
The planner can discard valid linking evidence through premature deduplication and can automatically attach known superseded counters through its fallback validation.

Full review comments:

- [P2] Deduplicate ticker hits only after validating their evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:92-98
  When multiple ISINs for one LEI map to the same HK ticker, the first hit marks the issuer/ticker pair as seen before validation. If that hit fails the HKEX ISIN check but a later hit matches, the valid hit is silently discarded, so an eligible automatic attachment is missed. This is especially relevant to the co-mapped tickers this change explicitly handles. Validate each hit before deduplicating successful candidates, and add a regression test with an invalid hit preceding a valid one.

- [P2] Reject superseded counters before attempting fallback validation — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:49-54
  When an HKEX row is marked `-OLD`, filtering it out of the lookup makes it indistinguishable from a missing row rather than rejecting the counter. Since `mergeHkexIsins` also drops superseded rows, the CLI then requests ticker-level FIGI validation, which can authorize attaching that obsolete counter if it remains in `stocks_universe`. Explicitly reject known superseded counters before either validation path instead of allowing the fallback to bypass this evidence.

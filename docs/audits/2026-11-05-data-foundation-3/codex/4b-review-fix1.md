OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b002-aeca-7b01-8346-efd3f07c739b
--------
user
commit 7c85a51
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 7c85a51; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Dy1CG6j6' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-gFre6Y7v' (errno=Operation not permitted)
 M docs/audits/2026-11-05-data-foundation-3/implementation-log.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/4b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0s7sWqRk' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-imzZBbTZ' (errno=Operation not permitted)
7c85a51 fix(entities): atomic set_issuer_identifier for cninfo orgId, store every cninfo response as evidence, explicit GLEIF download date
 scripts/entity-keys/fill-cninfo-org-id.ts          |  6 ++-
 scripts/entity-keys/fill-identifiers.ts            | 13 +++---
 src/lib/db/memory-table-client.ts                  | 17 ++++++-
 src/lib/entities/cninfo-org-id.test.ts             | 21 +++++++--
 src/lib/entities/cninfo-org-id.ts                  | 53 +++++++++++++---------
 src/lib/entities/identifiers.integration.test.ts   | 45 +++++++++++++++++-
 supabase/migrations.lock.json                      |  2 +-
 .../20261107090000_identifiers_and_dq.sql          | 31 +++++++++++++
 8 files changed, 151 insertions(+), 37 deletions(-)
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
/bin/zsh -lc 'find .. -name AGENTS.md -o -name AGENTS.override.md; git show 7c85a51 --; ls -a | head -30' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 341ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rN3YcXec' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4iWSvFTu' (errno=Operation not permitted)
commit 7c85a518278ffb3d5458b8d8e4758ea9aaf89f3c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 00:38:35 2026 -0800

    fix(entities): atomic set_issuer_identifier for cninfo orgId, store every cninfo response as evidence, explicit GLEIF download date
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/fill-cninfo-org-id.ts b/scripts/entity-keys/fill-cninfo-org-id.ts
index 8709173..8eb2b4b 100644
--- a/scripts/entity-keys/fill-cninfo-org-id.ts
+++ b/scripts/entity-keys/fill-cninfo-org-id.ts
@@ -13,7 +13,7 @@ import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} fro
 import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
 import {recordAttempt} from '../../src/lib/dq/freshness';
 import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
-import {cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from '../../src/lib/entities/cninfo-org-id';
+import {CninfoLookupError,cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from '../../src/lib/entities/cninfo-org-id';
 import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
 import {resolveOrgId} from '../../src/lib/research/ingest/collectors/cninfo';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
@@ -29,7 +29,9 @@ async function lookup(code:string):Promise<CninfoLookup>{
   bytes=new Uint8Array(await res.arrayBuffer());
   return new Response(bytes,{status:res.status,statusText:res.statusText,headers:res.headers});
  }) as typeof fetch;
- const hit=await resolveOrgId(code,{fetch:tap});
+ let hit:Awaited<ReturnType<typeof resolveOrgId>>;
+ try{hit=await resolveOrgId(code,{fetch:tap});}
+ catch(e){throw new CninfoLookupError(errorMessage(e),bytes.byteLength?bytes:null);}   // received bytes are stored before the failure is recorded
  return {hit:hit?{orgId:hit.orgId,name:hit.name}:null,bytes};
 }
 
diff --git a/scripts/entity-keys/fill-identifiers.ts b/scripts/entity-keys/fill-identifiers.ts
index 2faf3ce..f798989 100644
--- a/scripts/entity-keys/fill-identifiers.ts
+++ b/scripts/entity-keys/fill-identifiers.ts
@@ -30,21 +30,22 @@ import {makeBudget} from '../../src/lib/facts/sync';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
 const DATASET=DATASETS.entities.identifiers;
-const USAGE='usage: fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--issuer <uuid>]... [--apply]';
+const USAGE='usage: fill-identifiers.ts --gleif <lei-isin.csv> --hkex <dir> [--stage A|B|C|D|all] [--gleif-downloaded-at <ISO>] [--issuer <uuid>]... [--apply]';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const STAGES:Record<string,Stage[]>={A:['A'],B:['A','B'],C:['C'],D:['D'],all:['A','B','C','D']};
 const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
 const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
 const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
 
-interface Args{gleif:string|null;hkex:string|null;stages:Set<Stage>;issuers:string[];apply:boolean}
+interface Args{gleif:string|null;gleifDownloadedAt:string|null;hkex:string|null;stages:Set<Stage>;issuers:string[];apply:boolean}
 function bad():never{console.error(USAGE);process.exit(2);}
 function parseArgs(argv:string[]):Args{
- const a:Args={gleif:null,hkex:null,stages:new Set(STAGES.all),issuers:[],apply:false};
+ const a:Args={gleif:null,gleifDownloadedAt:null,hkex:null,stages:new Set(STAGES.all),issuers:[],apply:false};
  for(let i=0;i<argv.length;i++){
   const k=argv[i];
   if(k==='--apply')a.apply=true;
   else if(k==='--gleif')a.gleif=argv[++i]??bad();
+  else if(k==='--gleif-downloaded-at'){const v=argv[++i]??bad();if(!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2}))?$/.test(v)||Number.isNaN(Date.parse(v)))bad();a.gleifDownloadedAt=v;}
   else if(k==='--hkex')a.hkex=argv[++i]??bad();
   else if(k==='--stage'){const s=STAGES[argv[++i]??''];if(!s)bad();a.stages=new Set(s);}
   else if(k==='--issuer'){const id=argv[++i]??bad();if(!UUID.test(id))bad();a.issuers.push(id.toLowerCase());}
@@ -63,7 +64,7 @@ async function fileDigest(path:string):Promise<{sha256:string;bytes:number}>{
 
 interface Inputs{
  issuers:IssuerRow[];openRows:SecRow[];universe:Set<string>;scope:Row[];issuerRows:Row[];
- gleif:{subset:GleifSubset;sha256:string;bytes:number;downloaded:string}|null;
+ gleif:{subset:GleifSubset;sha256:string;bytes:number;downloaded_at:string|null;file_mtime:string}|null;
  hkex:{parses:HkexListParse[];bytes:Map<HkexFileId,Uint8Array>}|null;
 }
 
@@ -82,7 +83,7 @@ async function readInputs(tables:TableClient,args:Args):Promise<Inputs>{
   const lines:string[]=[];
   for await(const l of filterGleifLines(createInterface({input:createReadStream(args.gleif!),crlfDelay:Infinity}),leis))lines.push(l);
   const digest=await fileDigest(args.gleif!);
-  gleif={subset:subsetForLeis(lines,leis),...digest,downloaded:statSync(args.gleif!).mtime.toISOString().slice(0,10)};
+  gleif={subset:subsetForLeis(lines,leis),...digest,downloaded_at:args.gleifDownloadedAt,file_mtime:statSync(args.gleif!).mtime.toISOString()};
  }
  let hkex:Inputs['hkex']=null;
  if(args.stages.has('D')){
@@ -101,7 +102,7 @@ async function readInputs(tables:TableClient,args:Args):Promise<Inputs>{
 /** Stores the evidence, calls OpenFIGI (B, then C for rows still without a FIGI) and plans. */
 async function evidenceAndPlan(inp:Inputs,raw:RawStore,args:Args,asOf:string):Promise<{plan:IdentifierPlan;exhausted:boolean;requests:number}>{
  if(inp.gleif)await raw.put({kind:'gleif',bytes:new TextEncoder().encode(inp.gleif.subset.csv),contentType:'text/csv',
-  meta:{source_sha256:inp.gleif.sha256,source_bytes:inp.gleif.bytes,downloaded:inp.gleif.downloaded,leis:inp.gleif.subset.byLei.size}});
+  meta:{source_sha256:inp.gleif.sha256,source_bytes:inp.gleif.bytes,file_mtime:inp.gleif.file_mtime,...(inp.gleif.downloaded_at?{downloaded_at:inp.gleif.downloaded_at}:{}),leis:inp.gleif.subset.byLei.size}});
  let hkexMap:ReadonlyMap<string,HkexIsin>|null=null;
  if(inp.hkex){
   // each workbook keeps its own content type (two are .xls)
diff --git a/src/lib/db/memory-table-client.ts b/src/lib/db/memory-table-client.ts
index 8c353d3..66d3ee6 100644
--- a/src/lib/db/memory-table-client.ts
+++ b/src/lib/db/memory-table-client.ts
@@ -8,7 +8,7 @@
 //  - ordering and range filters (gte/lt) compare numbers numerically and everything else as
 //    strings by UTF-16 code unit, which matches PostgreSQL only under C collation (ISO-8601
 //    timestamps in one fixed format compare correctly; mixed offsets or locales do not).
-//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier); one synchronous JS turn stands for the row lock.
+//  - rpc emulates only the plan-3 row-locking functions (append_claim_evidence, patch_quarantine_detail, set_security_identifier, set_issuer_identifier); one synchronous JS turn stands for the row lock.
 import {TableError,assertMatch,assertUpdateMatch,checkRangeOptions,checkSelectOptions} from './table-client';
 import type {RangeOptions,Row,TableClient} from './table-client';
 
@@ -57,6 +57,21 @@ const MEMORY_RPC:Record<string,(rowsOf:(t:string)=>Row[],a:Row)=>unknown>={
   return true;
  },
  // plan audit round 3, R2: guarded ISIN/FIGI write + one provenance key merged (never replaced) in one step
+ // Task 4b review P1: guarded issuers.cninfo_org_id write + one provenance key merged (never replaced)
+ set_issuer_identifier(rowsOf,a){
+  const pv=a.p_provenance,v=a.p_value;
+  if(a.p_column!=='cninfo_org_id')throw new TableError('rpc','set_issuer_identifier','invalid_column','22023');
+  if(typeof v!=='string'||v.trim()===''||!isObj(pv))throw new TableError('rpc','set_issuer_identifier','invalid_identifier_write','22023');
+  const row=rowsOf('issuers').find(r=>r.issuer_id===a.p_issuer);
+  if(!row)return 'not_found';
+  if(row.status!=='active')return 'not_active';
+  if(row.cninfo_org_id!=null)return row.cninfo_org_id===v?'duplicate':'conflict';
+  if(rowsOf('issuers').some(r=>r!==row&&r.cninfo_org_id===v))return 'conflict';   // issuers_cninfo_idx
+  row.cninfo_org_id=v;
+  row.provenance={...(isObj(row.provenance)?row.provenance:{}),cninfo_org_id:clone(pv)};
+  row.updated_at=new Date().toISOString();
+  return 'written';
+ },
  set_security_identifier(rowsOf,a){
   const col=a.p_column,v=a.p_value,pv=a.p_provenance;
   if((col!=='isin'&&col!=='figi')||typeof v!=='string'||v===''||!isObj(pv)||Object.keys(pv).length!==1||!(col in pv))
diff --git a/src/lib/entities/cninfo-org-id.test.ts b/src/lib/entities/cninfo-org-id.test.ts
index 2db9309..0f0251d 100644
--- a/src/lib/entities/cninfo-org-id.test.ts
+++ b/src/lib/entities/cninfo-org-id.test.ts
@@ -1,9 +1,8 @@
 // src/lib/entities/cninfo-org-id.test.ts
 import {describe,it,expect} from 'vitest';
-import {TableError,type TableClient} from '../db/table-client';
 import {memoryTableClient} from '../db/memory-table-client';
 import {memoryRawStore} from '../dq/raw-store';
-import {cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from './cninfo-org-id';
+import {CninfoLookupError,cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from './cninfo-org-id';
 
 const USCI='91520000214434146R';
 const issuer=(id:string,o:Record<string,unknown>)=>({issuer_id:id,status:'active',merged_into:null,usci:USCI,cninfo_org_id:null,lei:null,cik:null,canonical_name_zh:'测试',canonical_name_en:null,provenance:{usci:{source:'test'}},updated_at:'2026-01-01T00:00:00Z',...o});
@@ -27,6 +26,20 @@ const bytes=(s:string)=>new TextEncoder().encode(s);
 const lookups=(m:Record<string,CninfoLookup|Error>)=>async(code:string)=>{const v=m[code];if(v instanceof Error)throw v;if(!v)throw new Error(`unexpected ${code}`);return v;};
 
 describe('cninfo org id fill',()=>{
+ it('stores every received response before interpreting it: a no-hit body and an error body are kept, the dry run keeps nothing',async()=>{
+  const c=await seed();const raw=memoryRawStore();
+  const res=await fillCninfoOrgIds({tables:c,raw,asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:null,bytes:bytes('[]')},'000001':new CninfoLookupError('cninfo 503',bytes('<html>busy</html>')) })},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
+  expect(raw.objects.size).toBe(4);   // two data objects + two sidecars
+  expect(res.planned.map(p=>[p.outcome,typeof p.evidence_sha256])).toEqual([['not_found','string'],['failed','string']]);
+  expect(res.errors.find(e=>e.code==='cninfo_error')!.message).toContain(res.planned[1].evidence_sha256!);
+ });
+ it('a provenance key written for another column meanwhile survives the orgId write (merge, not replace)',async()=>{
+  const c=await seed();
+  const targets=await cninfoTargets(c);
+  await c.update('issuers',{issuer_id:'a'},{provenance:{usci:{source:'test'},lei:{source:'later'}}});
+  await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':{hit:{orgId:'gssh0600519',name:'x'},bytes:bytes('[]')},'000001':{hit:null,bytes:bytes('[]')}})},targets,{batchId:'33333333-3333-4333-8333-333333333333'});
+  expect(Object.keys(c.rows('issuers').find(r=>r.issuer_id==='a')!.provenance as object).sort()).toEqual(['cninfo_org_id','lei','usci']);
+ });
  it('targets active issuers with a USCI, no orgId and an open A-share row (primary first)',async()=>{
   const c=await seed();
   expect((await cninfoTargets(c)).map(t=>[t.issuer_id,t.code,t.ticker])).toEqual([['a','600519','600519.SH'],['e','000001','000001.SZ']]);
@@ -46,8 +59,8 @@ describe('cninfo org id fill',()=>{
  });
  it('turns a unique-index clash into a set_identifier claim and a lookup failure into failed',async()=>{
   const c=await seed();
-  const clash:TableClient={...c,update:async(t,m,p)=>{if(t==='issuers'&&p.cninfo_org_id==='gssz0000001')throw new TableError('update','issuers','duplicate key value violates unique constraint "issuers_cninfo_idx"','23505');return c.update(t,m,p);}};
-  const res=await fillCninfoOrgIds({tables:clash,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':new Error('cninfo 503'),'000001':{hit:{orgId:'gssz0000001',name:'平安银行'},bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
+  await c.update('issuers',{issuer_id:'b'},{cninfo_org_id:'gssz0000001'});   // another issuer already holds it (issuers_cninfo_idx)
+  const res=await fillCninfoOrgIds({tables:c,raw:memoryRawStore(),asOf:'2026-11-05',sleep:async()=>{},lookup:lookups({'600519':new Error('cninfo 503'),'000001':{hit:{orgId:'gssz0000001',name:'平安银行'},bytes:bytes('[]')}})},await cninfoTargets(c),{batchId:'33333333-3333-4333-8333-333333333333'});
   const claims=c.rows('issuer_identifier_claims');
   expect(claims.map(x=>[x.issuer_id,x.id_type,x.value,x.op,x.source])).toEqual([['e','cninfo_org_id','gssz0000001','set_identifier','cninfo_topsearch']]);
   expect((claims[0].detail as {target:unknown;evidence_kind:string})).toMatchObject({target:{issuer_id:'e'},evidence_kind:'provider_mapping'});
diff --git a/src/lib/entities/cninfo-org-id.ts b/src/lib/entities/cninfo-org-id.ts
index bf815fd..704b575 100644
--- a/src/lib/entities/cninfo-org-id.ts
+++ b/src/lib/entities/cninfo-org-id.ts
@@ -5,19 +5,22 @@
 // becomes a set_identifier claim; a different value appearing concurrently becomes
 // correct_identifier. The exact topSearch response bytes go to reconcile-raw (kind 'cninfo') so
 // the provenance/claim hash is replayable. batchId null = dry run (no bucket, no DB writes).
-import {selectAll,type TableClient} from '../db/table-client';
+import {callRpc,selectAll,type TableClient} from '../db/table-client';
 import {emptyCounts,type BatchError} from '../dq/batches';
 import type {RawStore} from '../dq/raw-store';
-import {fileClaim,isUnique,type ClaimInput} from './claims';
+import {fileClaim,type ClaimInput} from './claims';
 import {errorMessage,withSkippedSummary,type ApplyResult} from './load-sec';
 import type {ClaimEvidence} from './types';
 
 export interface CninfoLookup{hit:{orgId:string;name:string}|null;bytes:Uint8Array}
+/** A failed lookup that still carries whatever bytes were received (HTTP error body, unparsable text): stored as evidence before the failure is recorded. */
+export class CninfoLookupError extends Error{constructor(message:string,readonly bytes:Uint8Array|null){super(message);this.name='CninfoLookupError';}}
 export interface CninfoTarget{issuer_id:string;code:string;ticker:string;provenance:Record<string,unknown>}
 export interface CninfoDeps{tables:TableClient;raw:RawStore;lookup:(code:string)=>Promise<CninfoLookup>;asOf:string;sleep?:(ms:number)=>Promise<void>;intervalMs?:number}
-export interface CninfoPlanned{issuer_id:string;code:string;orgId:string|null;outcome:'written'|'duplicate'|'claimed'|'not_found'|'failed'|'planned'}
+export interface CninfoPlanned{issuer_id:string;code:string;orgId:string|null;outcome:'written'|'duplicate'|'claimed'|'not_found'|'failed'|'planned';evidence_sha256?:string|null}
 
 const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
+const isJson=(b:Uint8Array)=>{try{JSON.parse(new TextDecoder().decode(b));return true;}catch{return false;}};
 const A_SHARE=/^\d{6}\.(SH|SZ)$/;
 
 export async function cninfoTargets(tables:TableClient):Promise<CninfoTarget[]>{
@@ -38,16 +41,24 @@ export async function fillCninfoOrgIds(deps:CninfoDeps,targets:readonly CninfoTa
  const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
  for(const [n,t] of targets.entries()){
   if(n>0)await sleep(deps.intervalMs??600);
-  let look:CninfoLookup;
-  try{look=await deps.lookup(t.code);}
-  catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed'});continue;}
-  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found'});continue;}
+  const apply=opts.batchId!==null;
+  // Every received response is stored (apply mode) before it is interpreted; dry run stores nothing.
+  const keep=async(bytes:Uint8Array|null):Promise<string|null>=>apply&&bytes&&bytes.byteLength>0?(await deps.raw.put({kind:'cninfo',bytes,contentType:isJson(bytes)?'application/json':'text/html',meta:{code:t.code}})).sha256:null;
+  let look:CninfoLookup|null=null,sha:string|null=null;
+  try{
+   try{look=await deps.lookup(t.code);}
+   catch(e){
+    const sha0=e instanceof CninfoLookupError?await keep(e.bytes):null;
+    throw Object.assign(new Error(errorMessage(e)+(sha0?` (response ${sha0})`:'')),{sha:sha0});
+   }
+   sha=await keep(look.bytes);
+  }catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed',evidence_sha256:(e as {sha?:string|null}).sha??null});continue;}
+  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found',evidence_sha256:sha});continue;}
   const orgId=look.hit.orgId;
-  const plan=(outcome:CninfoPlanned['outcome'])=>planned.push({issuer_id:t.issuer_id,code:t.code,orgId,outcome});
-  if(opts.batchId===null){plan('planned');continue;}
+  const plan=(outcome:CninfoPlanned['outcome'])=>planned.push({issuer_id:t.issuer_id,code:t.code,orgId,outcome,evidence_sha256:sha});
+  if(!apply){plan('planned');continue;}
   try{
-   const stored=await deps.raw.put({kind:'cninfo',bytes:look.bytes,contentType:'application/json',meta:{code:t.code}});
-   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:stored.sha256,locator:`topSearch:keyWord=${t.code}`};
+   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha!,locator:`topSearch:keyWord=${t.code}`};
    const claim=async(op:'set_identifier'|'correct_identifier',current:string|null)=>{
     const c:ClaimInput={issuer_id:t.issuer_id,id_type:'cninfo_org_id',value:orgId,source:'cninfo_topsearch',op,detail:{
      schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:t.issuer_id},params:op==='set_identifier'?{}:{expected_current:current,new_value:orgId},evidence,sources:[evidence],
@@ -55,19 +66,17 @@ export async function fillCninfoOrgIds(deps:CninfoDeps,targets:readonly CninfoTa
     const created=await fileClaim(tables,c);
     const k=created?op:`${op}_appended`;claims[k]=(claims[k]??0)+1;plan('claimed');
    };
-   try{
-    const n=await tables.update('issuers',{issuer_id:t.issuer_id,status:'active',cninfo_org_id:null},{
-     cninfo_org_id:orgId,provenance:{...t.provenance,cninfo_org_id:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:stored.sha256}},updated_at:new Date().toISOString(),
-    });
-    if(n===1){counts.inserted++;plan('written');continue;}
+   // One locked UPDATE merges the single provenance key (never replaces the object): see set_issuer_identifier.
+   const outcome=await callRpc(tables,'set_issuer_identifier',{p_issuer:t.issuer_id,p_column:'cninfo_org_id',p_value:orgId,p_provenance:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha}}) as string;
+   if(outcome==='written'){counts.inserted++;plan('written');continue;}
+   if(outcome==='duplicate'){counts.duplicates++;plan('duplicate');continue;}
+   if(outcome==='conflict'){
     const [now]=await tables.select('issuers',{issuer_id:t.issuer_id},{limit:1});
-    if(now?.cninfo_org_id===orgId){counts.duplicates++;plan('duplicate');continue;}
-    if(now?.status==='active'&&typeof now.cninfo_org_id==='string'){await claim('correct_identifier',now.cninfo_org_id);continue;}
-    counts.failed++;errors.push({code:'issuer_changed',key:t.issuer_id,message:'issuer no longer active'});plan('failed');
-   }catch(e){
-    if(isUnique(e)){await claim('set_identifier',null);continue;}
-    throw e;
+    if(typeof now?.cninfo_org_id==='string'&&now.cninfo_org_id!==orgId)await claim('correct_identifier',now.cninfo_org_id);
+    else await claim('set_identifier',null);   // the value is held by another issuer
+    continue;
    }
+   counts.failed++;errors.push({code:outcome==='not_active'?'issuer_changed':'issuer_missing',key:t.issuer_id,message:outcome});plan('failed');
   }catch(e){counts.failed++;errors.push({code:'cninfo_write_error',key:t.issuer_id,message:errorMessage(e)});plan('failed');}
  }
  counts.fetched=counts.inserted+counts.duplicates+counts.failed;
diff --git a/src/lib/entities/identifiers.integration.test.ts b/src/lib/entities/identifiers.integration.test.ts
index 3720362..1e8a001 100644
--- a/src/lib/entities/identifiers.integration.test.ts
+++ b/src/lib/entities/identifiers.integration.test.ts
@@ -709,7 +709,7 @@ describe.skipIf(!enabled)('plan 3 migration one: resolve_identifier_claim',()=>{
 
  it('grants the functions to service_role only, keeps the helpers private and has one replace_filing_expectations signature',async()=>{
   const FNS=['public.resolve_identifier_claim(uuid,text,uuid,jsonb)','public.replace_filing_expectations(uuid,text,jsonb,jsonb)','public.claim_calendar_pass(text,uuid)','public.fail_calendar_member(jsonb,uuid,text)','public.finish_calendar_pass(jsonb)',
-   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)'];
+   'public.append_claim_evidence(uuid,text,text,text,text,jsonb)','public.patch_quarantine_detail(uuid,text,jsonb)','public.set_security_identifier(uuid,text,date,text,text,jsonb)','public.set_issuer_identifier(uuid,text,text,jsonb)'];
   const HELPERS=['public.claim_text_is_date(text)','public.claim_keys_within(jsonb,text[])','public.claim_evidence_ok(jsonb)','public.identifier_claim_target_key(text,jsonb)','public.identifier_claim_problem(text,text,text,uuid,jsonb)','public.dq_calendar_lock_pass(jsonb)','public.claim_provenance_safe(jsonb,integer)'];
   for(const fn of [...FNS,...HELPERS])for(const role of ['anon','authenticated','service_role']){
    const ok=(await q(`select has_function_privilege($1,$2,'EXECUTE') ok`,[role,fn]))[0].ok;
@@ -1025,6 +1025,49 @@ describe.skipIf(!enabled)('plan 3 migration one: row-locked jsonb patches (appen
   });
   expect(await secState(t)).toEqual({isin,figi:'BBG000000001',provenance:{exchange:'Nasdaq',...PI}});
  });
+ // Task 4b review P1: the orgId write and its provenance key land in one locked UPDATE.
+ const setOrg=(issuerId:string,value:string,prov:unknown,on:Pool|PoolClient=admin,col='cninfo_org_id')=>
+  on.query(`select public.set_issuer_identifier($1,$2,$3,$4::jsonb) v`,[issuerId,col,value,JSON.stringify(prov)]).then(r=>r.rows[0].v as string);
+ const PO={source:'cninfo_topsearch',as_of:'2026-11-05',evidence_sha256:'3'.repeat(64)};
+ const issuerState=async(id:string)=>(await q(`select cninfo_org_id,provenance from public.issuers where issuer_id=$1`,[id]))[0];
+ it('set_issuer_identifier: written / duplicate / conflict (own value, other issuer holds it) / not_found / not_active / invalid; provenance merged',async()=>{
+  const a=await issuer(),b=await issuer();
+  await q(`update public.issuers set provenance=$2::jsonb where issuer_id=$1`,[a,JSON.stringify({usci:{source:'test'}})]);
+  const org='gssh'+hex(4);
+  expect(await setOrg(a,org,PO)).toBe('written');
+  expect(await setOrg(a,org,PO)).toBe('duplicate');
+  expect(await setOrg(a,'gssh'+hex(4),PO)).toBe('conflict');
+  expect(await issuerState(a)).toEqual({cninfo_org_id:org,provenance:{usci:{source:'test'},cninfo_org_id:PO}});
+  expect(await setOrg(b,org,PO)).toBe('conflict');                       // unique index: another issuer holds it
+  expect((await issuerState(b)).cninfo_org_id).toBeNull();
+  expect(await setOrg(randomUUID(),'gssh'+hex(4),PO)).toBe('not_found');
+  const c=await issuer();
+  await inTx(admin,async tx=>{
+   await tx.c.query(`select set_config('entities.allow_topology_write','on',true)`);
+   await tx.c.query(`update public.issuers set status='dissolved' where issuer_id=$1`,[c]);
+   await tx.commit();
+  });
+  expect(await setOrg(c,'gssh'+hex(4),PO)).toBe('not_active');
+  expect(await fails(setOrg(b,'gssh'+hex(4),PO,admin,'lei'))).toMatchObject({message:'invalid_column',code:'22023'});
+  expect(await fails(setOrg(b,'gssh'+hex(4),{source:'x',url:'https://a.example/p?token=1'}))).toMatchObject({message:'invalid_identifier_write',code:'22023'});
+  expect(await fails(setOrg(b,'  ',PO))).toMatchObject({message:'invalid_identifier_write'});
+ });
+ it('set_issuer_identifier interleaved with a provenance update for lei keeps both provenance keys, in either order',async()=>{
+  for(const orgFirst of [true,false]){
+   const a=await issuer();const org='gssh'+hex(4);
+   await q(`update public.issuers set provenance=$2::jsonb where issuer_id=$1`,[a,JSON.stringify({usci:{source:'test'}})]);
+   const lei={lei:{source:'later'}};
+   await inTx(admin,async tx=>{
+    if(orgFirst)expect(await setOrg(a,org,PO,tx.c)).toBe('written');
+    else await tx.c.query(`update public.issuers set provenance=provenance||$2::jsonb where issuer_id=$1`,[a,JSON.stringify(lei)]);
+    const second=orgFirst?admin.query(`update public.issuers set provenance=provenance||$2::jsonb where issuer_id=$1`,[a,JSON.stringify(lei)]):setOrg(a,org,PO);
+    await stillBlockedBehind(admin,tx.pid,second);
+    await tx.commit();
+    await second;
+   });
+   expect(await issuerState(a)).toEqual({cninfo_org_id:org,provenance:{usci:{source:'test'},cninfo_org_id:PO,...lei}});
+  }
+ });
  it('two transactions writing different ISINs to the same empty row: the second returns conflict and the first value stays',async()=>{
   const a=await issuer();const t=await ticker();const k={issuer:a,ticker:t};
   await sec(a,t,'2020-01-01',null);
diff --git a/supabase/migrations.lock.json b/supabase/migrations.lock.json
index 361f24a..ce18138 100644
--- a/supabase/migrations.lock.json
+++ b/supabase/migrations.lock.json
@@ -203,7 +203,7 @@
     },
     {
       "file": "20261107090000_identifiers_and_dq.sql",
-      "sha256": "5a378f2bcaebf3483ac98acf2643de76f92db58a0ad93f212bb26a582fb294ec"
+      "sha256": "316bbcb9f60938db367328d2321a40b7b019aaa7541827a8115768a60ae38570"
     }
   ]
 }
diff --git a/supabase/migrations/20261107090000_identifiers_and_dq.sql b/supabase/migrations/20261107090000_identifiers_and_dq.sql
index afb3efa..d4b2e2b 100644
--- a/supabase/migrations/20261107090000_identifiers_and_dq.sql
+++ b/supabase/migrations/20261107090000_identifiers_and_dq.sql
@@ -795,6 +795,37 @@ end $$;
 revoke execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) from public, anon, authenticated;
 grant execute on function public.set_security_identifier(uuid, text, date, text, text, jsonb) to service_role;
 
+-- ---------------------------------------------------------------- guarded issuer identifier write (Task 4b review, P1)
+-- set_issuer_identifier is the only writer of issuers.cninfo_org_id outside resolve_identifier_claim
+-- (cninfo-org-id.ts). It locks the issuer row FOR NO KEY UPDATE (the order and lock level of
+-- resolve_identifier_claim), requires status 'active' and, in ONE UPDATE, writes the column (only when
+-- empty) and merges provenance with `provenance || {p_column: p_provenance}` — never a whole-object
+-- replacement — so a concurrent write of another provenance key (lei, usci, ...) keeps its key.
+-- Outcomes: 'written', 'duplicate' (same value stored), 'conflict' (another value stored, or the
+-- value is held by another issuer: unique violation), 'not_found', 'not_active'.
+create or replace function public.set_issuer_identifier(p_issuer uuid, p_column text, p_value text, p_provenance jsonb)
+returns text language plpgsql security definer set search_path = public as $$
+declare v_cur text; v_status text;
+begin
+  if p_column is distinct from 'cninfo_org_id' then raise exception 'invalid_column' using errcode = '22023'; end if;
+  if coalesce(btrim(p_value), '') = '' or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
+     or not public.claim_provenance_safe(p_provenance) then
+    raise exception 'invalid_identifier_write' using errcode = '22023';
+  end if;
+  select i.status, i.cninfo_org_id into v_status, v_cur from public.issuers i where i.issuer_id = p_issuer for no key update;
+  if not found then return 'not_found'; end if;
+  if v_status <> 'active' then return 'not_active'; end if;
+  if v_cur is not null then return case when v_cur = p_value then 'duplicate' else 'conflict' end; end if;
+  begin
+    update public.issuers set cninfo_org_id = p_value, provenance = provenance || jsonb_build_object(p_column, p_provenance), updated_at = now()
+    where issuer_id = p_issuer;
+  exception when unique_violation then return 'conflict';
+  end;
+  return 'written';
+end $$;
+revoke execute on function public.set_issuer_identifier(uuid, text, text, jsonb) from public, anon, authenticated;
+grant execute on function public.set_issuer_identifier(uuid, text, text, jsonb) to service_role;
+
 -- ---------------------------------------------------------------- topology guard (§3.1, S1)
 -- issuers.status/merged_into change only inside set_merge/set_dissolved (migration two), which switch
 -- the transaction-local setting on and restore it on every exit path. A never-defined setting reads
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

exec
/bin/zsh -lc 'for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || { echo "$d/$f"; cat "$d/$f"; }; done; done; cat src/lib/research/ingest/collectors/cninfo.ts | head -180; cat src/lib/entities/cninfo-org-id.ts; cat src/lib/dq/raw-store.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>/**
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
// src/lib/entities/cninfo-org-id.ts
// Spec §4.1.6: fill issuers.cninfo_org_id for active issuers that have a USCI, no orgId and an open
// .SH/.SZ row, from 巨潮 topSearch (exact code match, landed resolveOrgId). The guarded update only
// fills an empty column of an active issuer; a unique-index clash (another issuer holds the orgId)
// becomes a set_identifier claim; a different value appearing concurrently becomes
// correct_identifier. The exact topSearch response bytes go to reconcile-raw (kind 'cninfo') so
// the provenance/claim hash is replayable. batchId null = dry run (no bucket, no DB writes).
import {callRpc,selectAll,type TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import type {RawStore} from '../dq/raw-store';
import {fileClaim,type ClaimInput} from './claims';
import {errorMessage,withSkippedSummary,type ApplyResult} from './load-sec';
import type {ClaimEvidence} from './types';

export interface CninfoLookup{hit:{orgId:string;name:string}|null;bytes:Uint8Array}
/** A failed lookup that still carries whatever bytes were received (HTTP error body, unparsable text): stored as evidence before the failure is recorded. */
export class CninfoLookupError extends Error{constructor(message:string,readonly bytes:Uint8Array|null){super(message);this.name='CninfoLookupError';}}
export interface CninfoTarget{issuer_id:string;code:string;ticker:string;provenance:Record<string,unknown>}
export interface CninfoDeps{tables:TableClient;raw:RawStore;lookup:(code:string)=>Promise<CninfoLookup>;asOf:string;sleep?:(ms:number)=>Promise<void>;intervalMs?:number}
export interface CninfoPlanned{issuer_id:string;code:string;orgId:string|null;outcome:'written'|'duplicate'|'claimed'|'not_found'|'failed'|'planned';evidence_sha256?:string|null}

const obj=(v:unknown)=>(v&&typeof v==='object'&&!Array.isArray(v)?v:{}) as Record<string,unknown>;
const isJson=(b:Uint8Array)=>{try{JSON.parse(new TextDecoder().decode(b));return true;}catch{return false;}};
const A_SHARE=/^\d{6}\.(SH|SZ)$/;

export async function cninfoTargets(tables:TableClient):Promise<CninfoTarget[]>{
 const issuers=(await selectAll(tables,'issuers',{status:'active',cninfo_org_id:null},'issuer_id')).filter(r=>typeof r.usci==='string'&&r.usci!=='');
 const out:CninfoTarget[]=[];
 for(const i of issuers){
  const rows=await tables.select('issuer_securities',{issuer_id:i.issuer_id,valid_to:null},{orderBy:'ticker'});
  const a=[...rows].sort((x,y)=>Number(y.is_primary===true)-Number(x.is_primary===true)).find(r=>A_SHARE.test(String(r.ticker)));
  if(a)out.push({issuer_id:String(i.issuer_id),code:String(a.ticker).slice(0,6),ticker:String(a.ticker),provenance:obj(i.provenance)});
 }
 return out;
}

export async function fillCninfoOrgIds(deps:CninfoDeps,targets:readonly CninfoTarget[],opts:{batchId:string|null}):Promise<ApplyResult&{claims:Record<string,number>;planned:CninfoPlanned[]}>{
 const {tables}=deps;
 const sleep=deps.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const counts=emptyCounts();const errors:BatchError[]=[];const planned:CninfoPlanned[]=[];
 const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
 for(const [n,t] of targets.entries()){
  if(n>0)await sleep(deps.intervalMs??600);
  const apply=opts.batchId!==null;
  // Every received response is stored (apply mode) before it is interpreted; dry run stores nothing.
  const keep=async(bytes:Uint8Array|null):Promise<string|null>=>apply&&bytes&&bytes.byteLength>0?(await deps.raw.put({kind:'cninfo',bytes,contentType:isJson(bytes)?'application/json':'text/html',meta:{code:t.code}})).sha256:null;
  let look:CninfoLookup|null=null,sha:string|null=null;
  try{
   try{look=await deps.lookup(t.code);}
   catch(e){
    const sha0=e instanceof CninfoLookupError?await keep(e.bytes):null;
    throw Object.assign(new Error(errorMessage(e)+(sha0?` (response ${sha0})`:'')),{sha:sha0});
   }
   sha=await keep(look.bytes);
  }catch(e){counts.failed++;errors.push({code:'cninfo_error',key:t.code,message:errorMessage(e)});planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'failed',evidence_sha256:(e as {sha?:string|null}).sha??null});continue;}
  if(!look.hit){skippedSummary.org_id_not_found=(skippedSummary.org_id_not_found??0)+1;planned.push({issuer_id:t.issuer_id,code:t.code,orgId:null,outcome:'not_found',evidence_sha256:sha});continue;}
  const orgId=look.hit.orgId;
  const plan=(outcome:CninfoPlanned['outcome'])=>planned.push({issuer_id:t.issuer_id,code:t.code,orgId,outcome,evidence_sha256:sha});
  if(!apply){plan('planned');continue;}
  try{
   const evidence:ClaimEvidence={source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha!,locator:`topSearch:keyWord=${t.code}`};
   const claim=async(op:'set_identifier'|'correct_identifier',current:string|null)=>{
    const c:ClaimInput={issuer_id:t.issuer_id,id_type:'cninfo_org_id',value:orgId,source:'cninfo_topsearch',op,detail:{
     schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:t.issuer_id},params:op==='set_identifier'?{}:{expected_current:current,new_value:orgId},evidence,sources:[evidence],
    }};
    const created=await fileClaim(tables,c);
    const k=created?op:`${op}_appended`;claims[k]=(claims[k]??0)+1;plan('claimed');
   };
   // One locked UPDATE merges the single provenance key (never replaces the object): see set_issuer_identifier.
   const outcome=await callRpc(tables,'set_issuer_identifier',{p_issuer:t.issuer_id,p_column:'cninfo_org_id',p_value:orgId,p_provenance:{source:'cninfo_topsearch',as_of:deps.asOf,evidence_sha256:sha}}) as string;
   if(outcome==='written'){counts.inserted++;plan('written');continue;}
   if(outcome==='duplicate'){counts.duplicates++;plan('duplicate');continue;}
   if(outcome==='conflict'){
    const [now]=await tables.select('issuers',{issuer_id:t.issuer_id},{limit:1});
    if(typeof now?.cninfo_org_id==='string'&&now.cninfo_org_id!==orgId)await claim('correct_identifier',now.cninfo_org_id);
    else await claim('set_identifier',null);   // the value is held by another issuer
    continue;
   }
   counts.failed++;errors.push({code:outcome==='not_active'?'issuer_changed':'issuer_missing',key:t.issuer_id,message:outcome});plan('failed');
  }catch(e){counts.failed++;errors.push({code:'cninfo_write_error',key:t.issuer_id,message:errorMessage(e)});plan('failed');}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.failed;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims,planned};
}
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

exec
/bin/zsh -lc "rg -n 'claim_provenance_safe|cninfo_org_id|provenance' supabase/migrations/20261107090000_identifiers_and_dq.sql | head -45; cat scripts/entity-keys/fill-cninfo-org-id.ts; cat src/lib/research/ingest/collectors/shared.ts | head -110; rg -n 'cninfo|provenance' supabase/migrations/*entities*; cat src/lib/db/table-client.ts | grep -A15 'function callRpc'; cat package.json | grep -A12 '\"test'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
58:  add constraint issuer_identifier_claims_id_type_check check (id_type in ('lei','cik','usci','isin','figi','cninfo_org_id','ticker')),
307:-- Recursive public-provenance guard (mirrors the TS sanitizeProvenance rules): no secret-like keys, no
309:-- Claim evidence may hold private notes; only what passes here may reach a public provenance column.
310:create or replace function public.claim_provenance_safe(p jsonb, p_depth int default 0) returns boolean
319:        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
323:        if not public.claim_provenance_safe(v, p_depth + 1) then return false; end if;
335:revoke execute on function public.claim_provenance_safe(jsonb, int) from public, anon, authenticated, service_role;
353:  t := p_detail -> 'target'; pa := p_detail -> 'params'; pw := p_detail -> 'provenance_written';
361:  if pw is not null and jsonb_typeof(pw) <> 'object' then return 'provenance_written'; end if;
371:    if p_id_type in ('lei','cik','usci','cninfo_org_id') then
426:  -- provenance_written must carry the op's own provenance key (the one resolve merges), plus only allowed keys.
427:  if pw is not null and (not public.claim_keys_within(pw, allowed) or not public.claim_provenance_safe(pw)
429:    return 'provenance_written';
441:-- issuer, merges detail.provenance_written (or, absent, the claim's evidence under the op's key) into
442:-- the target row's provenance, then records status/resolved_by/resolved_at. Any failure raises and
490:  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
495:     and public.claim_provenance_safe(to_jsonb(v_ev ->> 'locator')) then
498:  v_pw := coalesce(v_detail -> 'provenance_written', jsonb_build_object(v_key, v_safe));
503:  if not public.claim_provenance_safe(v_pw) then raise exception 'invalid_claim' using errcode = '22023', detail = 'provenance_written'; end if;
507:      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei is null;
509:      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik is null;
511:      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci is null;
512:    elsif v_op = 'set_identifier' and c.id_type = 'cninfo_org_id' then
513:      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id is null;
515:      update public.issuers set lei = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and lei = pa ->> 'expected_current';
517:      update public.issuers set cik = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cik = pa ->> 'expected_current';
519:      update public.issuers set usci = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and usci = pa ->> 'expected_current';
520:    elsif v_op = 'correct_identifier' and c.id_type = 'cninfo_org_id' then
521:      update public.issuers set cninfo_org_id = v_value, provenance = provenance || v_pw, updated_at = now() where issuer_id = c.issuer_id and status = 'active' and cninfo_org_id = pa ->> 'expected_current';
523:      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
526:      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
529:      update public.issuer_securities set isin = v_value, provenance = provenance || v_pw
532:      update public.issuer_securities set figi = v_value, provenance = provenance || v_pw
539:      insert into public.issuer_securities(issuer_id, ticker, isin, share_class, is_primary, valid_from, valid_to, valid_from_method, valid_to_method, source, provenance)
542:      update public.issuer_securities set valid_to = (pa ->> 'valid_to')::date, valid_to_method = pa ->> 'valid_to_method', provenance = provenance || v_pw
545:      update public.issuer_securities set valid_from = (pa ->> 'new_valid_from')::date, valid_from_method = pa ->> 'valid_from_method', provenance = provenance || v_pw
554:      if v_op in ('set_identifier','correct_identifier') and c.id_type in ('lei','cik','usci','cninfo_org_id') then
758:-- in ONE UPDATE writes the column (only when empty) and merges the single provenance key with
759:-- `provenance || p_provenance` — never a whole-object replacement — so a concurrent write of the other
760:-- column, or a claim resolution (which also merges with ||), keeps its key. p_provenance must carry
762:-- stored; a missing provenance key is completed in the same UPDATE), 'conflict' (another value is
765:create or replace function public.set_security_identifier(p_issuer uuid, p_ticker text, p_valid_from date, p_column text, p_value text, p_provenance jsonb)
770:     or p_provenance is null or jsonb_typeof(p_provenance) <> 'object'
771:     or (select array_agg(k) from jsonb_object_keys(p_provenance) k) is distinct from array[p_column] then
777:  select case when p_column = 'isin' then s.isin else s.figi end, s.provenance into v_cur, v_prov
/**
 * Fill issuers.cninfo_org_id from 巨潮 topSearch (spec §4.1.6): active issuers with a USCI, no orgId
 * and an open .SH/.SZ row; exact code match; one request every 600 ms.
 *   npx tsx scripts/entity-keys/fill-cninfo-org-id.ts [--apply]
 * Dry run (default): looks up and prints, writes nothing (no batch, no bucket). --apply records an
 * ingest batch (dataset entities.cninfo), stores every topSearch response in reconcile-raw, writes
 * guarded updates and files set_identifier claims on unique-index clashes.
 * first-cohort.json is no longer a write target.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import {supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {CninfoLookupError,cninfoTargets,fillCninfoOrgIds,type CninfoLookup} from '../../src/lib/entities/cninfo-org-id';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {resolveOrgId} from '../../src/lib/research/ingest/collectors/cninfo';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.cninfo;
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};

/** resolveOrgId through a fetch that keeps the exact response bytes (evidence for reconcile-raw). */
async function lookup(code:string):Promise<CninfoLookup>{
 let bytes=new Uint8Array();
 const tap=(async(url:string|URL|Request,init?:RequestInit)=>{
  const res=await fetch(url,init);
  bytes=new Uint8Array(await res.arrayBuffer());
  return new Response(bytes,{status:res.status,statusText:res.statusText,headers:res.headers});
 }) as typeof fetch;
 let hit:Awaited<ReturnType<typeof resolveOrgId>>;
 try{hit=await resolveOrgId(code,{fetch:tap});}
 catch(e){throw new CninfoLookupError(errorMessage(e),bytes.byteLength?bytes:null);}   // received bytes are stored before the failure is recorded
 return {hit:hit?{orgId:hit.orgId,name:hit.name}:null,bytes};
}

async function main(){
 const argv=process.argv.slice(2);
 if(argv.some(a=>a!=='--apply')){console.error('usage: fill-cninfo-org-id.ts [--apply]');process.exit(2);}
 const apply=argv.includes('--apply');
 const admin=getAdminSupabase();
 const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const targets=await cninfoTargets(tables);
 if(!apply){
  const res=await fillCninfoOrgIds({tables,raw:memoryRawStore(),lookup,asOf},targets,{batchId:null});
  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',targets:targets.length,planned:res.planned,skipped:res.skippedSummary,errors:res.errors},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'fill-cninfo-org-id',dataset:DATASET,toolVersions:{source:'cninfo_topsearch',as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{({counts,errors}=await fillCninfoOrgIds({tables,raw:supabaseRawStore(admin),lookup,asOf},targets,{batchId}));}
 catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
/** Shared collector plumbing: polite fetch, receipts, and versioned writes. */
import { ingestVersioned } from './write';
import type { IngestSourceInput } from '../../sources';
import type { CollectFailure, CollectOptions, CollectReceipt, CollectorCompany, CollectorSource } from './types';

export const DEFAULT_USER_AGENT = 'OsbornAlpha research osbornhello@gmail.com';

export interface Client {
  get(url: string, headers?: Record<string, string>): Promise<Response>;
  post(url: string, body: string, headers?: Record<string, string>): Promise<Response>;
}

/** One client per collector run: declares the User-Agent and keeps at least minIntervalMs between requests. */
export function createClient(opts: CollectOptions, defaultIntervalMs: number): Client {
  const doFetch = opts.fetch ?? fetch;
  const ua = opts.userAgent ?? process.env.EDGAR_USER_AGENT ?? DEFAULT_USER_AGENT;
  const gap = opts.minIntervalMs ?? defaultIntervalMs;
  let last = 0;
  const pace = async () => { const wait = last + gap - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now(); };
  const call = async (url: string, init: RequestInit) => {
    await pace();
    return doFetch(url, { ...init, headers: { 'User-Agent': ua, ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(30_000) });
  };
  return {
    get: (url, headers) => call(url, { method: 'GET', headers }),
    post: (url, body, headers) => call(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers } }),
  };
}

export class Receipt {
  readonly r: CollectReceipt;
  constructor(source: CollectorSource, companies: number, private readonly clock: () => Date) {
    this.r = { source, started_at: clock().toISOString(), finished_at: '', companies, fetched: 0, inserted: 0, duplicates: 0, versioned: 0, skipped: 0, lookups: 0, failures: [], ok: true };
  }
  fail(f: CollectFailure) { this.r.failures.push(f); this.r.ok = false; }
  finish(): CollectReceipt { this.r.finished_at = this.clock().toISOString(); return this.r; }
}

export const companyName = (c: CollectorCompany) => c.names_en[0] ?? c.names_zh[0] ?? c.entity_id;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const isoDate = (iso: string) => iso.slice(0, 10);

/** Write one document through the versioned path and account for it on the receipt. */
export async function writeDocument(opts: CollectOptions, receipt: Receipt, company: CollectorCompany, input: Omit<IngestSourceInput, 'source_version'>) {
  try {
    const res = await ingestVersioned(opts.ctx, input);
    if (res.duplicate) receipt.r.duplicates++; else { receipt.r.inserted++; if (res.versioned) receipt.r.versioned++; }
  } catch (e) {
    receipt.fail({ company: companyName(company), stage: 'ingest', message: errorMessage(e), url: input.url ?? undefined });
  }
}

/** Inclusive-start, exclusive-end window on an ISO instant. */
export function inWindow(iso: string, since: string, until?: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= Date.parse(since) && (until === undefined || t < Date.parse(until));
}

/** Calendar date (YYYY-MM-DD) of an ISO instant in a fixed UTC offset, for date-only upstream queries (UTC+8 for 巨潮 and HKEX). */
export function localDate(iso: string, offsetHours: number): string {
  return new Date(Date.parse(iso) + offsetHours * 3600_000).toISOString().slice(0, 10);
}
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

codex
No actionable regressions were identified in the commit. The atomic identifier update, response-evidence handling, and explicit GLEIF download metadata are consistent with the surrounding implementation. Tests were inspected but not executed in the read-only environment.
No actionable regressions were identified in the commit. The atomic identifier update, response-evidence handling, and explicit GLEIF download metadata are consistent with the surrounding implementation. Tests were inspected but not executed in the read-only environment.

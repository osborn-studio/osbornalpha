OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b03e-f0bb-7551-aeae-3f6bee44688f
--------
user
commit 675d23e
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 675d23e; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 496ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-aXKGy1yQ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-pSGENneh' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XGGendJs' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-L2itGqyH' (errno=Operation not permitted)
675d23e fix(entities): link-ah review (hard-identifier auto attach only, claims for the rest, -OLD rejection, order-independent grouping, apply-time conflict causes, OpenFIGI job errors, LEI-only selection)
 .../2026-11-05-data-foundation-3/verification.md   |  14 ++
 scripts/entity-keys/link-ah.ts                     |  23 ++-
 src/lib/entities/link-ah.test.ts                   | 178 +++++++++++++----
 src/lib/entities/link-ah.ts                        | 211 +++++++++++++++------
 4 files changed, 326 insertions(+), 100 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show 675d23e -- src/lib/entities/link-ah.ts scripts/entity-keys/link-ah.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-YZcNeLGe' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-f0AJHhtE' (errno=Operation not permitted)
commit 675d23e03b37498cae8a2eea7192418b8b926c20
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:44:22 2026 -0800

    fix(entities): link-ah review (hard-identifier auto attach only, claims for the rest, -OLD rejection, order-independent grouping, apply-time conflict causes, OpenFIGI job errors, LEI-only selection)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/link-ah.ts b/scripts/entity-keys/link-ah.ts
index 8406afa..70e3aeb 100644
--- a/scripts/entity-keys/link-ah.ts
+++ b/scripts/entity-keys/link-ah.ts
@@ -21,7 +21,7 @@ import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers
 import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
 import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
 import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
-import {applyAhLinks,figiHitsFromResults,planAhLinks,type AhIssuer,type UniverseListing} from '../../src/lib/entities/link-ah';
+import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,type TickerLookup,type UniverseListing} from '../../src/lib/entities/link-ah';
 import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
@@ -46,11 +46,9 @@ async function main(){
  const asOf=new Date().toISOString().slice(0,10);
  const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
  const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
- const issuers:AhIssuer[]=(await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>{
-  const id=String(r.issuer_id);const tickers=open.filter(o=>String(o.issuer_id)===id).map(o=>String(o.ticker));
-  return {issuer_id:id,lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null),
-   aTickers:tickers.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:tickers.filter(t=>/^\d{5}\.HK$/.test(t))};
- }).filter(i=>(i.aTickers.length>0||i.usci!==null)&&i.hTickers.length===0);
+ const issuers=selectAhIssuers((await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>({
+  issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null)})),
+  open.map(o=>({issuer_id:String(o.issuer_id),ticker:String(o.ticker)})));
  const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
  const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
  const lines:string[]=[];
@@ -78,9 +76,9 @@ async function main(){
   const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
   const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
   const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
-  // OpenFIGI tickers are hints: HKEX code+ISIN validates; a ticker-level FIGI is the fallback for codes HKEX has no ISIN for
+  // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
   const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
-  const tickerFigi=new Map<string,string>();
+  const tickerLookup=new Map<string,TickerLookup>();
   let exhausted=m.exhausted;
   if(unvalidated.length&&!exhausted){
    const t=await mapTickers(unvalidated,deps);
@@ -88,14 +86,14 @@ async function main(){
    for(const [tk,r] of t.byKey){
     if(r.status!=='ok')continue;
     const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
-    if(c&&c.groups.length===1)tickerFigi.set(tk,c.groups[0].figi);
+    if(c&&c.groups.length===1)tickerLookup.set(tk,{figi:c.groups[0].figi,level:c.groups[0].level,evidence:r.evidence});
    }
   }
   const listRaw=hkexRaw.get('list_of_securities');
-  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,tickerFigi,
+  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),
    hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
    raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
-  return {plan,exhausted,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
+  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
  };
  if(!apply){
   const {plan,exhausted}=await run(memoryRawStore(),null);
@@ -108,8 +106,9 @@ async function main(){
   gleif_subset_sha256:subset.sha256,hkex_file_sha256s:JSON.stringify(Object.fromEntries(hkexParses.map(p=>[p.file,p.sha256]))),openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,names:NAMES_VERSION,as_of:asOf}});
  let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
  try{
-  const {result,exhausted}=await run(supabaseRawStore(admin),batchId);
+  const {result,exhausted,figiFailures}=await run(supabaseRawStore(admin),batchId);
   if(result)({counts,errors}=result);
+  if(figiFailures){counts.failed+=figiFailures;errors=[...errors,{code:'openfigi_unprocessed',message:`${figiFailures} OpenFIGI request failures or unprocessed ISINs`}];}
   if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs skipped'}];
  }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
  finally{
diff --git a/src/lib/entities/link-ah.ts b/src/lib/entities/link-ah.ts
index 3685ef1..a8fd31b 100644
--- a/src/lib/entities/link-ah.ts
+++ b/src/lib/entities/link-ah.ts
@@ -6,57 +6,74 @@
 // normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
 // only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
 // waits for a confirmed source (spec §14-1).
-// OpenFIGI hints are never trusted on their own: one ISIN can map to several tickers (Tencent:
-// 00700.HK, 80700.HK, TCTZF), so a returned HK ticker is attached automatically only when it is
-// validated as this issuer's own line — HKEX stock code + ISIN match, or (when HKEX has no ISIN for
-// the code) a ticker-level FIGI equal to the ISIN-level FIGI. Anything else is skipped, not claimed.
+// OpenFIGI tickers are HINTS: one ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK,
+// TCTZF). Hits are classified first (superseded -OLD counters, non-equity, not in universe are
+// dropped and summarised), then grouped per (issuer, ticker) and decided deterministically:
+//   - automatic attach ONLY on hard identifiers: HKEX ISIN of the stock code == the hit's ISIN
+//     (and no conflicting hit for that ticker);
+//   - every other in-universe HK hit not held by the issuer (no HKEX ISIN, HKEX/GLEIF ISIN
+//     disagreement, a second H line, ambiguous ISINs) becomes an attach_security claim
+//     (provider_mapping) with all evidence, a ticker-level FIGI lookup being evidence only;
+//   - a ticker open at another issuer is an ownership_conflict quarantine.
 import type {TableClient} from '../db/table-client';
 import {emptyCounts,type BatchError} from '../dq/batches';
 import {fileClaim,type ClaimInput} from './claims';
 import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
 import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
-import {groupFigiResults,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
+import {groupFigiResults,type FigiEvidence,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
 import {rawPath} from '../dq/raw-store';
 import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
 import {sanitizeProvenance} from './provenance';
 import {attachSecurity} from './securities';
 import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';
 
-/** HKEX list Category value for ordinary equity, compared lower-cased (Task 3a verification). */
+/** HKEX list Category value for ordinary equity, compared lower-cased and EXACTLY (live categories include "Equity Warrants…" and "Real Estate Investment Trusts"). */
 export const HKEX_EQUITY_CATEGORY='equity';
 export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
-export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;responseSha256:string;index:number;lei:string}
+export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;requestSha256?:string;responseSha256:string;index:number;lei:string}
 export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
+/** A ticker-level OpenFIGI lookup: evidence only, never grounds for an automatic attach. */
+export interface TickerLookup{figi:string;level:'composite'|'venue';evidence:FigiEvidence}
+/** A per-job OpenFIGI `error` result (not `not_found`): the batch must fail with its evidence. */
+export interface FigiJobError{isin:string;lei:string;message:string;evidence:FigiEvidence}
 export interface AhLinkInput{
  asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
  universe:ReadonlyMap<string,UniverseListing>;
  /** ticker → issuer_id of its open row */
  openOwner:ReadonlyMap<string,string>;
  hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
- /** 5-digit stock code → ISIN (mergeHkexIsins); validation source #1 for rule 1 */
+ /** 5-digit stock code → ISIN (mergeHkexIsins): the hard identifier for automatic attach */
  hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
- /** HK ticker → FIGI from a ticker-level OpenFIGI lookup; validation source #2 when HKEX has no ISIN for the code */
- tickerFigi?:ReadonlyMap<string,string>;
+ /** 5-digit codes of superseded (-OLD) counters dropped by mergeHkexIsins */
+ hkexSuperseded?:ReadonlySet<string>;
+ tickerLookup?:ReadonlyMap<string,TickerLookup>;
+ figiErrors?:readonly FigiJobError[];
  /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
  raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
 }
-export interface AhLinkPlan{attaches:IssuerSecurityInput[];conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[]}
-
-type Validated='hkex_isin'|'ticker_figi';
-/** Is this OpenFIGI-returned HK ticker verifiably the issuer's own line? Otherwise the skip reason. */
-function validateHit(h:AhFigiHit,input:AhLinkInput):{ok:true;by:Validated;locator:string}|{ok:false;reason:string}{
- const code=h.ticker.slice(0,5);
- const row=input.hkex?.rows.find(r=>r.stockCode===code&&!SUPERSEDED.test((r.name??'').trim()));
- if(row&&row.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY)return {ok:false,reason:'not_equity'};
- const k=input.hkexIsins?.get(code);
- if(k)return k.isin===h.isin?{ok:true,by:'hkex_isin',locator:`hkex:${k.file}:${k.sha256}:row:${k.row}`}:{ok:false,reason:'hkex_isin_mismatch'};
- const tf=input.tickerFigi?.get(h.ticker);
- if(tf&&h.figi&&tf===h.figi)return {ok:true,by:'ticker_figi',locator:`openfigi_ticker:${tf}`};
- return {ok:false,reason:'ticker_unvalidated'};
+export interface AhLinkPlan{
+ attaches:IssuerSecurityInput[];
+ /** planned evidence per attach, keyed `${issuer_id}|${ticker}`: kept in the quarantine if the apply-time insert conflicts */
+ attachEvidence:Record<string,Record<string,unknown>>;
+ conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[];figiErrors:FigiJobError[];
 }
+
 const SUPERSEDED=/-\s*old$/i;
 export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';
 
+/**
+ * Issuers a run considers. Rule 1 needs only a LEI (share_class falls back to 'unknown'); rule 2
+ * and the 'H' share class need A-share rows, which planAhLinks enforces itself.
+ */
+export function selectAhIssuers(issuers:readonly {issuer_id:string;lei:string|null;usci:string|null;names:string[]}[],openTickers:readonly {issuer_id:string;ticker:string}[]):AhIssuer[]{
+ const by=new Map<string,string[]>();
+ for(const t of openTickers)by.set(t.issuer_id,[...(by.get(t.issuer_id)??[]),t.ticker]);
+ return issuers.map(i=>{
+  const ts=by.get(i.issuer_id)??[];
+  return {issuer_id:i.issuer_id,lei:i.lei,usci:i.usci,names:i.names,aTickers:ts.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:ts.filter(t=>/^\d{5}\.HK$/.test(t))};
+ }).filter(i=>i.lei!==null||i.aTickers.length>0);
+}
+
 /** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
 export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
  const out:AhFigiHit[]=[];
@@ -68,51 +85,118 @@ export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:st
    for(const c of groupFigiResults(r.records).candidates){
     if(c.market!=='HK')continue;
     const one=c.groups.length===1?c.groups[0]:null;
-    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
+    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,requestSha256:r.evidence.request_sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
    }
   }
  }
  return out;
 }
 
+/** Per-job `error` results for the issuers' ISINs (`not_found` is a normal outcome and is not listed). */
+export function figiErrorsFromResults(issuers:readonly AhIssuer[],gleif:{byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):FigiJobError[]{
+ const out:FigiJobError[]=[];const seen=new Set<string>();
+ for(const i of issuers){
+  if(!i.lei)continue;
+  for(const isin of gleif.byLei.get(i.lei)??[]){
+   const r=results.get(isin);
+   if(!r||r.status!=='error'||seen.has(isin))continue;
+   seen.add(isin);out.push({isin,lei:i.lei,message:r.message.slice(0,200),evidence:r.evidence});
+  }
+ }
+ return out.sort((a,b)=>a.isin<b.isin?-1:1);
+}
+
 function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
  if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
  return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
 }
 const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
+const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
+
+type Kind='hard'|'disagree'|'soft';
+type Classified={skip:string}|{kind:Kind;hk:HkexIsin|null};
+/** Per-hit gate, in this order: superseded counter (rejected before any validation), non-equity, not in universe; then hard / disagree / soft. */
+function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
+ const code=h.ticker.slice(0,5);
+ const k=input.hkexIsins?.get(code)??null;
+ const rows=input.hkex?.rows.filter(r=>r.stockCode===code)??[];
+ const live=rows.filter(r=>!SUPERSEDED.test((r.name??'').trim()));
+ if((rows.length>0&&live.length===0)||(!k&&input.hkexSuperseded?.has(code)))return {skip:'superseded_counter'};
+ if(live.length>0&&!live.some(r=>r.category?.trim().toLowerCase()===HKEX_EQUITY_CATEGORY))return {skip:'not_equity'};
+ if(!input.universe.has(h.ticker))return {skip:'ticker_not_in_universe'};
+ if(!k)return {kind:'soft',hk:null};
+ return {kind:k.isin===h.isin?'hard':'disagree',hk:k};
+}
 
 export function planAhLinks(input:AhLinkInput):AhLinkPlan{
- const plan:AhLinkPlan={attaches:[],conflicts:[],claims:[],skipped:[]};
+ const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
  const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
- const linked=new Set<string>();const seen=new Set<string>();
- for(const h of input.figiHits){
-  const i=byId.get(h.issuer_id);
-  if(!i)continue;
-  if(i.hTickers.length){plan.skipped.push('already_has_h');continue;}
+ const linked=new Set<string>();
+ // 1. classify every hit (order independent), 2. group per (issuer, ticker), 3. decide per group
+ const groups=new Map<string,{issuer:AhIssuer;ticker:string;hits:{h:AhFigiHit;c:{kind:Kind;hk:HkexIsin|null}}[]}>();
+ const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
+ for(const h of hits){
+  const issuer=byId.get(h.issuer_id);
+  if(!issuer)continue;
+  const c=classifyHit(h,input);
+  if('skip' in c){plan.skipped.push(c.skip);continue;}
   const k=`${h.issuer_id}|${h.ticker}`;
-  if(seen.has(k))continue;
-  seen.add(k);
-  const u=input.universe.get(h.ticker);
-  if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
-  const v=validateHit(h,input);
-  if(!v.ok){plan.skipped.push(v.reason);continue;}
-  const owner=input.openOwner.get(h.ticker);
-  if(owner===h.issuer_id){plan.skipped.push('already_attached');linked.add(h.issuer_id);continue;}
+  const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
+  g.hits.push({h,c});groups.set(k,g);
+ }
+ for(const k of [...groups.keys()].sort()){
+  const {issuer:i,ticker,hits:gh}=groups.get(k)!;
+  const u=input.universe.get(ticker)!;
+  const owner=input.openOwner.get(ticker);
+  if(owner===i.issuer_id||i.hTickers.includes(ticker)){plan.skipped.push('already_attached');linked.add(i.issuer_id);continue;}
+  const first=gh[0].h;
+  const g0=input.raw?.gleif,hk0=input.raw?.hkex;
+  const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
+   ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
+  const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
   if(owner!==undefined){
-   const g=input.raw?.gleif,hk=input.raw?.hkex;
-   plan.conflicts.push({naturalKey:`${h.ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,validated_by:v.by,
-    evidence:{gleif_sha256:h.gleifSha256,...(g?{gleif_path:g.path}:{}),openfigi_response_sha256:h.responseSha256,openfigi_path:rawPath('openfigi',h.responseSha256,'json'),...(hk?{hkex_sha256:hk.sha256,hkex_path:hk.path}:{})}},
-    payload:{issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin}});
-   continue;
+   plan.conflicts.push({naturalKey:`${ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence},
+    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin}});
+   linked.add(i.issuer_id);continue;
   }
+  const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
+  const hard=gh.filter(x=>x.c.kind==='hard');
+  const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
   const l=listing(u,input.asOf);
-  const provenance=sanitizeProvenance({
-   isin:{source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index};${v.locator}`},
-   ...(h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:h.responseSha256,job:jobOf(h.job),level:h.level}}:{}),
-   ...l.prov,
-  });
-  plan.attaches.push({issuer_id:h.issuer_id,ticker:h.ticker,isin:h.isin,figi:h.figi,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
-  linked.add(h.issuer_id);
+  const figiHit=gh.find(x=>x.h.figi);
+  if(auto){
+   const hk=hard[0].c.hk!;const h=hard[0].h;
+   const provenance=sanitizeProvenance({
+    isin:{source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${hk.row}`,
+     corroborated_by:[{source:'gleif_openfigi',evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`}]},
+    ...(figiHit?.h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:figiHit.h.responseSha256,job:jobOf(figiHit.h.job),level:figiHit.h.level}}:{}),
+    ...l.prov,
+   });
+   plan.attaches.push({issuer_id:i.issuer_id,ticker,isin:h.isin,figi:figiHit?.h.figi??null,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
+   plan.attachEvidence[k]={rule:'same_lei',validated_by:'hkex_isin',evidence:rawEvidence,isin:h.isin};
+   linked.add(i.issuer_id);continue;
+  }
+  // claim: everything not backed by an HKEX ISIN equal to the GLEIF/OpenFIGI one
+  const sources:ClaimEvidence[]=[];
+  const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
+  for(const {h,c} of gh){
+   add({source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
+    note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
+   if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
+    note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
+  }
+  const tl=input.tickerLookup?.get(ticker);
+  if(tl)add({source:'openfigi_ticker',as_of:input.asOf,evidence_sha256:tl.evidence.response_sha256,locator:`openfigi:${tl.evidence.response_sha256}#${tl.evidence.index}`,
+   note:`ticker-level lookup FIGI ${tl.figi} (${tl.level}); request ${tl.evidence.request_sha256}; ${figiHit?.h.figi?(tl.figi===figiHit.h.figi?'matches':'differs from')+` ISIN-level FIGI ${figiHit.h.figi}`:'no ISIN-level FIGI to compare'}`});
+  const why=i.hTickers.length>0?'issuer already holds an H line':kinds.includes('disagree')?'HKEX and GLEIF/OpenFIGI ISINs disagree':isins.length>1?'several ISINs map to this ticker':'no HKEX ISIN confirms this listing';
+  const evidence:ClaimEvidence={...sources[0],note:`${sources[0].note??''}; review: ${why}`.slice(0,500)};
+  sources[0]=evidence;
+  plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'gleif_openfigi',op:'attach_security',detail:{
+   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:i.issuer_id},
+   params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
+   evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
+  }});
+  linked.add(i.issuer_id);
  }
  if(input.hkex){
   const hk=input.hkex;
@@ -149,18 +233,39 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
  return plan;
 }
 
+/** Re-reads the ticker's rows after attachSecurity reported a conflict and names the actual cause. */
+async function conflictCause(tables:TableClient,a:IssuerSecurityInput):Promise<{reasonCode:string;detail:Record<string,unknown>}>{
+ const rows=await tables.select('issuer_securities',{ticker:a.ticker},{orderBy:'valid_from'});
+ const to=a.valid_to??null;
+ const overlap=rows.filter(r=>(to===null||String(r.valid_from)<to)&&(r.valid_to==null||a.valid_from<String(r.valid_to)));
+ const other=overlap.find(r=>r.issuer_id!==a.issuer_id);
+ if(other)return {reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',owner_issuer_id:String(other.issuer_id),owner_valid_from:String(other.valid_from),owner_valid_to:other.valid_to==null?null:String(other.valid_to)}};
+ const own=rows.filter(r=>r.issuer_id===a.issuer_id&&(overlap.includes(r)||String(r.valid_from)===a.valid_from));
+ if(own.length)return {reasonCode:'window_conflict',detail:{reason:'window_overlaps_own_row',rows:own.map(r=>({valid_from:String(r.valid_from),valid_to:r.valid_to==null?null:String(r.valid_to),isin:r.isin==null?null:String(r.isin)}))}};
+ const holders=a.isin?(await tables.select('issuer_securities',{isin:a.isin},{orderBy:'valid_from'})).filter(r=>r.ticker!==a.ticker):[];
+ return {reasonCode:'identifier_conflict',detail:{reason:'isin_held_by_other_row',isin:a.isin??null,holders:holders.map(r=>({issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from)}))}};
+}
+
 export async function applyAhLinks(tables:TableClient,plan:AhLinkPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult&{claims:Record<string,number>}>{
  const counts=emptyCounts();const errors:BatchError[]=[];const claims:Record<string,number>={};
- const park=(naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode:'ownership_conflict',detail,payload,batchId:opts.batchId},counts,errors,{code:'ownership_conflict',key:naturalKey});
+ const park=(reasonCode:string,naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode,detail,payload,batchId:opts.batchId},counts,errors,{code:reasonCode,key:naturalKey});
+ for(const e of plan.figiErrors){
+  counts.failed++;
+  errors.push({code:'openfigi_error',key:e.isin,message:JSON.stringify({lei:e.lei,message:e.message,request_sha256:e.evidence.request_sha256,response_sha256:e.evidence.response_sha256,index:e.evidence.index})});
+ }
  for(const a of plan.attaches){
   try{
    const res=await attachSecurity(tables,a);
    if(res==='inserted')counts.inserted++;
    else if(res==='duplicate')counts.duplicates++;
-   else await park(`${a.ticker}:${a.valid_from}`,{reason:'ticker_owned_by_other_issuer',rule:'same_lei'},{issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
+   else{
+    const cause=await conflictCause(tables,a);
+    await park(cause.reasonCode,`${a.ticker}:${a.valid_from}`,{...(plan.attachEvidence[`${a.issuer_id}|${a.ticker}`]??{}),rule:'same_lei',...cause.detail},
+     {issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
+   }
   }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:a.ticker,message:errorMessage(e)});}
  }
- for(const x of plan.conflicts)await park(x.naturalKey,x.detail,x.payload);
+ for(const x of plan.conflicts)await park('ownership_conflict',x.naturalKey,x.detail,x.payload);
  for(const c of plan.claims){
   try{const created=await fileClaim(tables,c);const k=created?c.op:`${c.op}_appended`;claims[k]=(claims[k]??0)+1;}
   catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.value}`,message:errorMessage(e)});}

exec
/bin/zsh -lc "find . -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md | head -60; cat src/lib/entities/securities.ts; sed -n '1,190p' scripts/entity-keys/link-ah.ts; sed -n '1,210p' src/lib/entities/claims.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 43ms:
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
/**
 * A+H linking (spec §4.2.2): rule 1 same LEI (GLEIF ISIN → OpenFIGI HK line → automatic attach at
 * the listing date), rule 2 HKEX list name match (attach_security claims only).
 *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
 * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
 * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is linked only when validated (HKEX code + ISIN, or ticker-level FIGI).
 * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
 * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
 * (dataset entities.ah-link) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY.
 */
import {createReadStream,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers/gleif';
import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,type TickerLookup,type UniverseListing} from '../../src/lib/entities/link-ah';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.ahLink;
const USAGE='usage: link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
function bad():never{console.error(USAGE);process.exit(2);}

async function main(){
 const argv=process.argv.slice(2);
 let gleifPath:string|null=null,hkexDir:string|null=null,apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--gleif')gleifPath=argv[++i]??bad();
  else if(argv[i]==='--hkex')hkexDir=argv[++i]??bad();
  else bad();
 }
 if(!gleifPath||!existsSync(gleifPath)||!hkexDir||!existsSync(hkexDir))bad();
 if(apply&&!EXCH_MAP_VERIFIED){console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (verification.md)');process.exit(2);}
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
 const issuers=selectAhIssuers((await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>({
  issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null)})),
  open.map(o=>({issuer_id:String(o.issuer_id),ticker:String(o.ticker)})));
 const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
 const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
 const lines:string[]=[];
 for await(const l of filterGleifLines(createInterface({input:createReadStream(gleifPath),crlfDelay:Infinity}),leis))lines.push(l);
 const subset=subsetForLeis(lines,leis);
 const hkexParses:HkexListParse[]=[];const hkexBytes=new Map<HkexFileId,Uint8Array>();
 for(const f of HKEX_LIST_FILES){
  const p=join(hkexDir,f.file);
  if(!existsSync(p))continue;
  const b=new Uint8Array(readFileSync(p));
  hkexParses.push(parseHkexList(b,f.id));hkexBytes.set(f.id,b);
 }
 const listParse=hkexParses.find(p=>p.file==='list_of_securities')??null;
 const merged=hkexParses.length?mergeHkexIsins(hkexParses):null;
 const hkexIsins=merged?.hasIsinColumn?merged.byCode:null;

 const run=async(raw:RawStore,batchId:string|null)=>{
  const gleifRaw=await raw.put({kind:'gleif',bytes:new TextEncoder().encode(subset.csv),contentType:'text/csv',meta:{purpose:'ah-link',leis:subset.byLei.size}});
  const hkexRaw=new Map<HkexFileId,{sha256:string;path:string}>();
  for(const p of hkexParses){
   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
   const st=await raw.put({kind:'hkex',bytes:hkexBytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
   hkexRaw.set(p.file,{sha256:st.sha256,path:st.path});
  }
  const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
  const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
  const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
  // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
  const tickerLookup=new Map<string,TickerLookup>();
  let exhausted=m.exhausted;
  if(unvalidated.length&&!exhausted){
   const t=await mapTickers(unvalidated,deps);
   exhausted=t.exhausted;
   for(const [tk,r] of t.byKey){
    if(r.status!=='ok')continue;
    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
    if(c&&c.groups.length===1)tickerLookup.set(tk,{figi:c.groups[0].figi,level:c.groups[0].level,evidence:r.evidence});
   }
  }
  const listRaw=hkexRaw.get('list_of_securities');
  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),
   hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
   raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
 };
 if(!apply){
  const {plan,exhausted}=await run(memoryRawStore(),null);
  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',candidates:issuers.length,quotaExhausted:exhausted,
   attaches:plan.attaches.map(a=>({issuer_id:a.issuer_id,ticker:a.ticker,share_class:a.share_class,valid_from:a.valid_from,method:a.valid_from_method})),
   conflicts:plan.conflicts.length,claims:plan.claims.map(c=>({issuer_id:c.issuer_id,ticker:c.value})),skipped:plan.skipped.length},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'link-ah',dataset:DATASET,toolVersions:{
  gleif_subset_sha256:subset.sha256,hkex_file_sha256s:JSON.stringify(Object.fromEntries(hkexParses.map(p=>[p.file,p.sha256]))),openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,names:NAMES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {result,exhausted,figiFailures}=await run(supabaseRawStore(admin),batchId);
  if(result)({counts,errors}=result);
  if(figiFailures){counts.failed+=figiFailures;errors=[...errors,{code:'openfigi_unprocessed',message:`${figiFailures} OpenFIGI request failures or unprocessed ISINs`}];}
  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs skipped'}];
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
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
/bin/zsh -lc "sed -n '200,238p' src/lib/entities/link-ah.ts; cat src/lib/entities/provenance.ts | head -140; git show 675d23e -- src/lib/entities/link-ah.test.ts; sed -n '1,200p' src/lib/entities/identifiers/hkex-list.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
 }
 if(input.hkex){
  const hk=input.hkex;
  const byName=new Map<string,HkexListRow[]>();
  for(const r of hk.rows){
   if(r.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY||!r.name||SUPERSEDED.test(r.name.trim()))continue;
   const n=normalizeCompanyName(r.name);
   if(!n)continue;
   byName.set(n,[...(byName.get(n)??[]),r]);
  }
  for(const i of input.issuers){
   if(linked.has(i.issuer_id)||i.aTickers.length===0||i.hTickers.length>0)continue;
   const names=new Set(i.names.map(normalizeCompanyName).filter(n=>n!==''));
   if(!names.size){plan.skipped.push('name_match_no_name');continue;}
   const codes=new Map<string,HkexListRow>();
   for(const n of names)for(const r of byName.get(n)??[])codes.set(r.stockCode,r);
   if(codes.size!==1){plan.skipped.push(codes.size?'name_match_multiple':'name_match_none');continue;}
   const row=[...codes.values()][0];
   const ticker=`${row.stockCode}.HK`;
   const u=input.universe.get(ticker);
   if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
   const owner=input.openOwner.get(ticker);
   if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
   const l=listing(u,input.asOf);
   const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
   plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
    schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
    evidence,sources:[evidence],...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   }});
  }
 }
 plan.skipped.sort();
 return plan;
}

/** Re-reads the ticker's rows after attachSecurity reported a conflict and names the actual cause. */
async function conflictCause(tables:TableClient,a:IssuerSecurityInput):Promise<{reasonCode:string;detail:Record<string,unknown>}>{
 const rows=await tables.select('issuer_securities',{ticker:a.ticker},{orderBy:'valid_from'});
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-w7tTq4Y0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fHVCXrT0' (errno=Operation not permitted)
commit 675d23e03b37498cae8a2eea7192418b8b926c20
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:44:22 2026 -0800

    fix(entities): link-ah review (hard-identifier auto attach only, claims for the rest, -OLD rejection, order-independent grouping, apply-time conflict causes, OpenFIGI job errors, LEI-only selection)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/link-ah.test.ts b/src/lib/entities/link-ah.test.ts
index 5f3e871..bbd93b3 100644
--- a/src/lib/entities/link-ah.test.ts
+++ b/src/lib/entities/link-ah.test.ts
@@ -1,23 +1,30 @@
 // src/lib/entities/link-ah.test.ts
 import {describe,it,expect} from 'vitest';
 import {memoryTableClient} from '../db/memory-table-client';
-import type {FigiJob,FigiJobResult,FigiRecord} from './identifiers/openfigi';
-import {applyAhLinks,figiHitsFromResults,planAhLinks,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';
+import {memoryRawStore} from '../dq/raw-store';
+import {loaderOutcome} from './load-sec';
+import {mapIsins,type FigiJob,type FigiJobResult,type FigiRecord} from './identifiers/openfigi';
+import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';
 
 const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.ah-link';
 const A='10000000-0000-4000-8000-0000000000a1',B='10000000-0000-4000-8000-0000000000b1',C='10000000-0000-4000-8000-0000000000c1';
 const LEI='529900T8BM49AURSDO55';
 const iss=(o:Partial<AhIssuer>):AhIssuer=>({issuer_id:A,lei:LEI,usci:null,names:['Weichai Power Co., Ltd.','潍柴动力股份有限公司'],aTickers:['000338.SZ'],hTickers:[],...o});
-const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
+const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
 const UNI=new Map([['02338.HK',{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}],['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
 const HK_ISIN=(code:string,isin='CNE1000004L9')=>[code,{isin,file:'isin_hkex' as const,sha256:'e'.repeat(64),row:7}] as const;
 const input=(o:Partial<AhLinkInput>={}):AhLinkInput=>({asOf:ASOF,issuers:[iss({})],figiHits:[hit()],universe:UNI,openOwner:new Map(),hkex:null,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('02899')]),...o});
 
-describe('planAhLinks · rule 1 (same LEI)',()=>{
- it('attaches the HK line at its listing date as an H share with GLEIF/OpenFIGI/listing provenance',()=>{
+const hkexList=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
+const RAWS={gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}};
+const U2=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
+const strip=(p:ReturnType<typeof planAhLinks>)=>JSON.stringify(p);
+
+describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
+ it('auto-attaches only when the HKEX ISIN equals the hit ISIN; provenance.isin is the HKEX evidence, GLEIF/OpenFIGI corroborate',()=>{
   const p=planAhLinks(input());
   expect(p.attaches).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',share_class:'H',is_primary:false,valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',provenance:{
-   isin:{source:'gleif_openfigi',as_of:ASOF,evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0;hkex:isin_hkex:${'e'.repeat(64)}:row:7`},
+   isin:{source:'hkex_isin_hkex',as_of:ASOF,evidence_sha256:'e'.repeat(64),locator:'isin_hkex:row:7',corroborated_by:[{source:'gleif_openfigi',evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0`}]},
    figi:{source:'openfigi',as_of:ASOF,evidence_sha256:'c'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},level:'composite'},
    valid_from:{source:'stocks_universe.list_date',provider:'tushare_hk_basic',as_of:ASOF,row:{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}},
   }}]);
@@ -29,41 +36,106 @@ describe('planAhLinks · rule 1 (same LEI)',()=>{
   expect(Object.keys(p.attaches[0].provenance??{})).toEqual(['isin']);
   expect(shareClassFor(iss({aTickers:[],usci:'91370000163446410B'}))).toBe('H');
  });
- it('quarantines a line owned by another issuer and skips issuers that already hold an H line',()=>{
-  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:{gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}}}));
+ it('quarantines a line owned by another issuer with the full evidence, whatever the validation class',()=>{
+  const e={gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:RAWS.hkex.path};
+  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
   expect(owned.attaches).toEqual([]);
-  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:`gleif/${'a'.repeat(64)}.csv`,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:`hkex/${'d'.repeat(64)}.xlsx`}},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
-  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_has_h']);
+  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,classified:['hard'],evidence:e},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
+  const soft=planAhLinks(input({hkexIsins:new Map(),openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
+  expect([soft.claims,soft.attaches]).toEqual([[],[]]);
+  expect(soft.conflicts[0].detail).toMatchObject({classified:['soft'],owner_issuer_id:B});
+ });
+ it('summarises not-in-universe and not-equity drops; an own existing line is already_attached',()=>{
   expect(planAhLinks(input({figiHits:[hit({ticker:'09999.HK'})],hkexIsins:new Map([HK_ISIN('09999')])})).skipped).toEqual(['ticker_not_in_universe']);
+  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity Warrants'}])})).skipped.includes('not_equity')).toBe(true);
+  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Real Estate Investment Trusts'}])})).attaches).toEqual([]);
+  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_attached']);
+ });
+ it('files a provider_mapping attach_security claim for a hit without an HKEX ISIN, with ticker-lookup evidence; never auto-attaches',()=>{
+  const tl={figi:'BBG000WEICH1',level:'composite' as const,evidence:{request_sha256:'f'.repeat(64),response_sha256:'9'.repeat(64),index:2}};
+  const p=planAhLinks(input({hkexIsins:new Map(),tickerLookup:new Map([['02338.HK',tl]])}));
+  expect(p.attaches).toEqual([]);
+  expect(p.claims).toHaveLength(1);
+  const c=p.claims[0];
+  expect(c).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',op:'attach_security',source:'gleif_openfigi',detail:{evidence_kind:'provider_mapping',target:{issuer_id:A},
+   params:{ticker:'02338.HK',isin:'CNE1000004L9',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi'}}});
+  expect(c.detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','openfigi_ticker']);
+  expect(c.detail.sources[0].note).toContain(`request ${'b'.repeat(64)}`);
+  expect(c.detail.sources[0].note).toContain('FIGI BBG000WEICH1, composite');
+  expect(c.detail.sources[1]).toMatchObject({evidence_sha256:'9'.repeat(64),locator:`openfigi:${'9'.repeat(64)}#2`});
+  expect(c.detail.sources[1].note).toContain(`request ${'f'.repeat(64)}`);
+  expect(c.detail.sources[1].note).toContain('matches ISIN-level FIGI BBG000WEICH1');
+  expect(Object.keys(c.detail.provenance_written??{})).toEqual(['valid_from']);
  });
- it('never links a co-mapped ticker that cannot be validated as the issuer\'s own line (Tencent: 00700.HK, 80700.HK, TCTZF)',()=>{
-  const U=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
-  const multi=[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})];
-  // HKEX ISIN match only for the real counter; the RMB counter has a different HKEX ISIN
-  const p=planAhLinks(input({universe:U,figiHits:multi,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
+ it('files a claim (no isin param) when HKEX and GLEIF/OpenFIGI ISINs disagree, and when the issuer already holds an H line',()=>{
+  const d=planAhLinks(input({hkexIsins:new Map([HK_ISIN('02338','HK0000000001')])}));
+  expect(d.attaches).toEqual([]);
+  expect(d.claims).toHaveLength(1);
+  expect(d.claims[0].detail.params).not.toHaveProperty('isin');
+  expect(d.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','hkex_isin_hkex']);
+  expect(d.claims[0].detail.sources[1].note).toContain('disagrees');
+  const second=planAhLinks(input({issuers:[iss({hTickers:['00001.HK']})]}));
+  expect([second.attaches.length,second.claims.length]).toEqual([0,1]);
+ });
+ it('never links every ticker OpenFIGI returns for an ISIN (Tencent: 00700.HK, 80700.HK, TCTZF): only the HKEX-confirmed one attaches',()=>{
+  const p=planAhLinks(input({universe:U2,figiHits:[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})],hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
   expect(p.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
-  expect(p.skipped).toEqual(['hkex_isin_mismatch']);
-  // no HKEX ISIN for the code and no ticker-level FIGI → unvalidated, nothing attached or quarantined
-  const none=planAhLinks(input({universe:U,figiHits:[hit({ticker:'80700.HK'})],hkexIsins:new Map(),openOwner:new Map([['80700.HK',B]])}));
-  expect([none.attaches,none.conflicts,none.claims]).toEqual([[],[],[]]);
-  expect(none.skipped).toEqual(['ticker_unvalidated']);
- });
- it('accepts a ticker-level FIGI equal to the ISIN-level FIGI when HKEX has no ISIN for the code',()=>{
-  const ok=planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000WEICH1']])}));
-  expect(ok.attaches).toHaveLength(1);
-  expect((ok.attaches[0].provenance as {isin:{locator:string}}).isin.locator).toContain('openfigi_ticker:BBG000WEICH1');
-  expect(planAhLinks(input({hkexIsins:new Map(),tickerFigi:new Map([['02338.HK','BBG000OTHER9']])})).skipped).toEqual(['ticker_unvalidated']);
-  expect(planAhLinks(input({hkexIsins:new Map(),figiHits:[hit({figi:null,level:null})],tickerFigi:new Map([['02338.HK','BBG000WEICH1']])})).skipped).toEqual(['ticker_unvalidated']);
- });
- it('rejects a non-equity HKEX category and ignores -OLD counters in the name match',()=>{
-  const row=(category:string,name='WEICHAI POWER CO LTD - H')=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:[{stockCode:'02338',name,category,isin:null,row:5}]});
-  expect(planAhLinks(input({hkex:row('Equity Warrants')})).skipped).toEqual(['name_match_none','not_equity']);
-  expect(planAhLinks(input({figiHits:[],hkex:row('Equity','WEICHAI POWER CO LTD - H-OLD')})).skipped).toEqual(['name_match_none']);
+  expect(p.claims.map(c=>c.value)).toEqual(['80700.HK']);
+ });
+ it('rejects -OLD superseded counters before any validation: no attach, no claim, summarised',()=>{
+  const old=hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H-OLD',category:'Equity'}]);
+  const a=planAhLinks(input({hkex:old}));
+  expect([a.attaches,a.claims,a.conflicts]).toEqual([[],[],[]]);
+  expect(a.skipped.filter(x=>x==='superseded_counter')).toEqual(['superseded_counter']);
+  // dropped from the ISIN workbooks only (no list rows): same outcome, even with no HKEX ISIN left for the code
+  const b=planAhLinks(input({hkexIsins:new Map(),hkexSuperseded:new Set(['02338'])}));
+  expect([b.attaches,b.claims,b.conflicts]).toEqual([[],[],[]]);
+  expect(b.skipped).toEqual(['superseded_counter']);
+  // also not quarantined when another issuer owns the old counter
+  expect(planAhLinks(input({hkex:old,openOwner:new Map([['02338.HK',B]])})).conflicts).toEqual([]);
+ });
+ it('is independent of hit order and keeps ambiguity: an invalid hit before or after a valid one gives the same plan',()=>{
+  const ok=hit();
+  const old=hit({ticker:'02899.HK'});
+  const list=hkexList([{stockCode:'02899',name:'OTHER CO LTD - H-OLD',category:'Equity'}]);
+  const x=planAhLinks(input({figiHits:[old,ok],hkex:list}));
+  const y=planAhLinks(input({figiHits:[ok,old],hkex:list}));
+  expect(strip(x)).toBe(strip(y));
+  expect(x.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
+  // two ISINs for one ticker, only one confirmed by HKEX: ambiguous → one claim, no attach, no isin param, any order
+  const other=hit({isin:'CNE1000004M7',index:1});
+  const p1=planAhLinks(input({figiHits:[ok,other]}));
+  const p2=planAhLinks(input({figiHits:[other,ok]}));
+  expect(strip(p1)).toBe(strip(p2));
+  expect(p1.attaches).toEqual([]);
+  expect(p1.claims).toHaveLength(1);
+  expect(p1.claims[0].detail.params).not.toHaveProperty('isin');
+  expect(p1.claims[0].detail.sources.length).toBeGreaterThanOrEqual(3);
+ });
+});
+
+describe('selectAhIssuers',()=>{
+ it('keeps LEI-bearing issuers for rule 1 even without A rows or USCI; A-share restriction stays with rule 2 / share class',()=>{
+  const rows=[
+   {issuer_id:A,lei:LEI,usci:null,names:['X']},
+   {issuer_id:B,lei:null,usci:'91370000163446410B',names:['Y']},
+   {issuer_id:C,lei:null,usci:null,names:['Z']},
+   {issuer_id:'10000000-0000-4000-8000-0000000000d1',lei:null,usci:null,names:['W']},
+  ];
+  const sel=selectAhIssuers(rows,[{issuer_id:C,ticker:'601899.SH'},{issuer_id:A,ticker:'AAPL'},{issuer_id:A,ticker:'02338.HK'}]);
+  expect(sel.map(i=>i.issuer_id)).toEqual([A,C]);
+  expect(sel[0]).toMatchObject({aTickers:[],hTickers:['02338.HK']});
+  expect(shareClassFor(sel[0])).toBe('unknown');
+  expect(shareClassFor(sel[1])).toBe('H');
+  // an LEI issuer with no A rows still gets a rule-1 attach (share class unknown) and no rule-2 claim
+  const p=planAhLinks(input({issuers:[{...sel[0],hTickers:[]}],hkex:hkexList([{stockCode:'02338',name:'X',category:'Equity'}])}));
+  expect(p.attaches[0]).toMatchObject({issuer_id:A,share_class:'unknown'});
+  expect(p.claims).toEqual([]);
  });
 });
 
 describe('planAhLinks · rule 2 (HKEX name match)',()=>{
- const hkex=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
+ const hkex=hkexList;
  it('files one attach_security claim (name_match) for exactly one equal Equity name',()=>{
   const p=planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02339',name:'WEICHAI POWER CO LTD - H',category:'Debt Securities'}])}));
   expect(p.attaches).toEqual([]);
@@ -89,7 +161,25 @@ describe('figiHitsFromResults',()=>{
   const job:FigiJob={idType:'ID_ISIN',idValue:'CNE1000004L9'};
   const results=new Map<string,FigiJobResult>([['CNE1000004L9',{job,status:'ok',records:[rec({}),rec({ticker:'000338',exchCode:'CS',figi:'BBG000WEICH2',compositeFIGI:'BBG000WEICH2'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:3}}]]);
   const hits=figiHitsFromResults([iss({})],{sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])},results);
-  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
+  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
+ });
+
+ it('lists per-job error results (not not_found) with their evidence; an HTTP-200 all-errors response fails the batch',async()=>{
+  const fetch=(async()=>new Response(JSON.stringify([{error:'Invalid idValue format'}]),{status:200})) as typeof globalThis.fetch;
+  const m=await mapIsins(['CNE1000004L9'],{fetch,raw:memoryRawStore(),sleep:async()=>{}});
+  const gleif={sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])};
+  expect(figiHitsFromResults([iss({})],gleif,m.byKey)).toEqual([]);
+  const errs=figiErrorsFromResults([iss({})],gleif,m.byKey);
+  expect(errs).toHaveLength(1);
+  expect(errs[0]).toMatchObject({isin:'CNE1000004L9',lei:LEI,message:'Invalid idValue format',evidence:{index:0}});
+  const nf=new Map<string,FigiJobResult>([['CNE1000004L9',{job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},status:'not_found',message:'No identifier found.',evidence:errs[0].evidence}]]);
+  expect(figiErrorsFromResults([iss({})],gleif,nf)).toEqual([]);
+  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  const res=await applyAhLinks(c,planAhLinks(input({figiHits:[],figiErrors:errs})),{batchId:BATCH,dataset:DATASET});
+  expect(res.counts.failed).toBe(1);
+  expect(res.errors.find(e=>e.code==='openfigi_error')).toMatchObject({key:'CNE1000004L9'});
+  expect(JSON.parse(res.errors.find(e=>e.code==='openfigi_error')!.message!)).toMatchObject({request_sha256:errs[0].evidence.request_sha256,response_sha256:errs[0].evidence.response_sha256,index:0});
+  expect(loaderOutcome('partial',res.counts)).toEqual({ok:false,exitCode:1});
  });
 });
 
@@ -99,7 +189,7 @@ describe('applyAhLinks',()=>{
   await c.insert('issuer_securities',{issuer_id:B,ticker:'02899.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
   const plan=planAhLinks(input({issuers:[iss({}),iss({issuer_id:C,lei:null,names:['Zijin Mining Group Co., Ltd.'],aTickers:['601899.SH']})],
    figiHits:[hit(),hit({issuer_id:A,ticker:'02899.HK'})],openOwner:new Map([['02899.HK',B]]),
-   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]}}));
+   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]},raw:RAWS}));
   const res=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
   expect(c.rows('issuer_securities').find(r=>r.ticker==='02338.HK')).toMatchObject({issuer_id:A,share_class:'H',valid_from_method:'listing_date'});
   expect(c.rows('dq_quarantine').map(q=>[q.natural_key,q.reason_code])).toEqual([[`02899.HK:${ASOF}`,'ownership_conflict']]);
@@ -109,4 +199,22 @@ describe('applyAhLinks',()=>{
   const again=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
   expect(again.counts).toMatchObject({inserted:0,duplicates:1});
  });
+
+ it('keeps the planned evidence and names the real cause when attachSecurity conflicts at apply time',async()=>{
+  const mk=()=>memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  const row=(o:Record<string,unknown>)=>({issuer_id:B,ticker:'02338.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{},...o});
+  const plan=planAhLinks(input({raw:RAWS}));
+  // another issuer opened the ticker after planning
+  const c1=mk();await c1.insert('issuer_securities',row({}));
+  const r1=await applyAhLinks(c1,plan,{batchId:BATCH,dataset:DATASET});
+  const q1=c1.rows('dq_quarantine')[0];
+  expect(q1.reason_code).toBe('ownership_conflict');
+  expect(q1.detail).toMatchObject({reason:'ticker_owned_by_other_issuer',owner_issuer_id:B,rule:'same_lei',validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,hkex_sha256:'d'.repeat(64)}});
+  expect(r1.counts).toMatchObject({quarantined:1,inserted:0});
+  // the issuer's own row already covers an overlapping window
+  const c2=mk();await c2.insert('issuer_securities',row({issuer_id:A,valid_from:'2010-01-01'}));
+  await applyAhLinks(c2,plan,{batchId:BATCH,dataset:DATASET});
+  expect(c2.rows('dq_quarantine')[0].reason_code).toBe('window_conflict');
+  expect(c2.rows('dq_quarantine')[0].detail).toMatchObject({reason:'window_overlaps_own_row',evidence:{gleif_sha256:'a'.repeat(64)}});
+ });
 });
// src/lib/entities/identifiers/hkex-list.ts
// Stage D (spec §4.1.4): HKEX securities lists → (stock code, name, category, ISIN). Columns are
// located by header text, never by position (HKEX changed the layout; circular CT/118/25 added ISIN
// to ListOfSecurities.xlsx). A file without an ISIN column still yields names and categories, which
// the A+H name match uses (§4.2.2). ISIN precedence follows HKEX_LIST_FILES priority.
import {createHash} from 'node:crypto';
import * as XLSX from 'xlsx';
import {isValidIsin} from '../../research/entity-keys/identifiers';

export const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
export const XLS_MIME='application/vnd.ms-excel' as const;
export type HkexFileId='list_of_securities'|'isin_hkex'|'isin_other_agencies';
export interface HkexListFile{id:HkexFileId;file:string;contentType:typeof XLSX_MIME|typeof XLS_MIME;url:string|null;priority:number}
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

exec
/bin/zsh -lc "nl -ba src/lib/entities/link-ah.ts | sed -n '174,203p'; git status --short; cat package.json | grep -A15 scripts; rg -n 'append_claim_evidence|evidence_sha256.*source|source.*evidence_sha256' supabase/migrations/20261107090000* | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
   174	   });
   175	   plan.attaches.push({issuer_id:i.issuer_id,ticker,isin:h.isin,figi:figiHit?.h.figi??null,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
   176	   plan.attachEvidence[k]={rule:'same_lei',validated_by:'hkex_isin',evidence:rawEvidence,isin:h.isin};
   177	   linked.add(i.issuer_id);continue;
   178	  }
   179	  // claim: everything not backed by an HKEX ISIN equal to the GLEIF/OpenFIGI one
   180	  const sources:ClaimEvidence[]=[];
   181	  const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
   182	  for(const {h,c} of gh){
   183	   add({source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
   184	    note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
   185	   if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
   186	    note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
   187	  }
   188	  const tl=input.tickerLookup?.get(ticker);
   189	  if(tl)add({source:'openfigi_ticker',as_of:input.asOf,evidence_sha256:tl.evidence.response_sha256,locator:`openfigi:${tl.evidence.response_sha256}#${tl.evidence.index}`,
   190	   note:`ticker-level lookup FIGI ${tl.figi} (${tl.level}); request ${tl.evidence.request_sha256}; ${figiHit?.h.figi?(tl.figi===figiHit.h.figi?'matches':'differs from')+` ISIN-level FIGI ${figiHit.h.figi}`:'no ISIN-level FIGI to compare'}`});
   191	  const why=i.hTickers.length>0?'issuer already holds an H line':kinds.includes('disagree')?'HKEX and GLEIF/OpenFIGI ISINs disagree':isins.length>1?'several ISINs map to this ticker':'no HKEX ISIN confirms this listing';
   192	  const evidence:ClaimEvidence={...sources[0],note:`${sources[0].note??''}; review: ${why}`.slice(0,500)};
   193	  sources[0]=evidence;
   194	  plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'gleif_openfigi',op:'attach_security',detail:{
   195	   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:i.issuer_id},
   196	   params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
   197	   evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   198	  }});
   199	  linked.add(i.issuer_id);
   200	 }
   201	 if(input.hkex){
   202	  const hk=input.hkex;
   203	  const byName=new Map<string,HkexListRow[]>();
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fK8grU2t' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YG8rwqVS' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review.md
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
490:  -- Fallback provenance carries only source / as_of / evidence_sha256 (+ a safe locator): the claim's
493:  v_safe := jsonb_build_object('source', v_ev -> 'source', 'as_of', v_ev -> 'as_of', 'evidence_sha256', v_ev -> 'evidence_sha256');
712:-- append_claim_evidence is the only writer of a pending claim's detail.sources after filing (claims.ts
714:-- evidence or one of its sources (same source + evidence_sha256) and appends the rest with jsonb_set on
717:create or replace function public.append_claim_evidence(p_issuer uuid, p_id_type text, p_value text, p_op text, p_target_key text, p_evidence jsonb)
729:  if coalesce(v_detail -> 'evidence' ->> 'source' = p_evidence ->> 'source' and v_detail -> 'evidence' ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256', false)
731:                where s ->> 'source' = p_evidence ->> 'source' and s ->> 'evidence_sha256' = p_evidence ->> 'evidence_sha256') then
737:revoke execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
738:grant execute on function public.append_claim_evidence(uuid, text, text, text, text, jsonb) to service_role;

codex
The new claim path loses ambiguity evidence during persistence and suppresses valid name-match fallback candidates after unconfirmed mappings.

Full review comments:

- [P2] Preserve grouped mapping evidence through claim persistence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:181-184
  When multiple ISINs map to the same ticker, every GLEIF/OpenFIGI evidence item has the same source and GLEIF subset hash. Although this planner distinguishes their locators, `fileClaim` deduplicates by `(source, evidence_sha256)` alone, as does `append_claim_evidence`. Consequently, applying the plan discards every mapping except the first, losing the alternative ISINs and response locators needed to review the ambiguity. Aggregate these mappings into evidence that survives the persistence contract, and test the persisted claim rather than only the plan.

- [P2] Keep name-match fallback available after unconfirmed hints — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:199-199
  When an issuer has an unconfirmed OpenFIGI hint for one ticker and an exact HKEX name match for a different ticker, filing the provider-mapping claim now marks the entire issuer as linked. The subsequent rule-2 loop skips that issuer, so the actual name-matched listing never gets a claim. Previously, an unvalidated hint did not suppress this fallback. Reserve issuer-wide suppression for confirmed links, or deduplicate claims by ticker so an unrelated tentative mapping cannot hide the name-match candidate.
The new claim path loses ambiguity evidence during persistence and suppresses valid name-match fallback candidates after unconfirmed mappings.

Full review comments:

- [P2] Preserve grouped mapping evidence through claim persistence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:181-184
  When multiple ISINs map to the same ticker, every GLEIF/OpenFIGI evidence item has the same source and GLEIF subset hash. Although this planner distinguishes their locators, `fileClaim` deduplicates by `(source, evidence_sha256)` alone, as does `append_claim_evidence`. Consequently, applying the plan discards every mapping except the first, losing the alternative ISINs and response locators needed to review the ambiguity. Aggregate these mappings into evidence that survives the persistence contract, and test the persisted claim rather than only the plan.

- [P2] Keep name-match fallback available after unconfirmed hints — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:199-199
  When an issuer has an unconfirmed OpenFIGI hint for one ticker and an exact HKEX name match for a different ticker, filing the provider-mapping claim now marks the entire issuer as linked. The subsequent rule-2 loop skips that issuer, so the actual name-matched listing never gets a claim. Previously, an unvalidated hint did not suppress this fallback. Reserve issuer-wide suppression for confirmed links, or deduplicate claims by ticker so an unrelated tentative mapping cannot hide the name-match candidate.

OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0b5-5b95-7041-87b0-e02ff1e51630
--------
user
commit 8118c46
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 8118c46; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1421ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-svwvGpWi' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Bxpgzka6' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/12-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-e3C2I25B' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-SY2paepc' (errno=Operation not permitted)
8118c46 fix(facts): acceptance data properties are informational, 3-year lookback with --full-history, conflict-safe filingsByAccession, single-query E7 report (Task 12 quality review)
 scripts/facts/enrich-acceptance.ts                 | 26 +++++++-------
 .../entities/identifiers/sec-submissions.test.ts   | 17 ++++++++-
 src/lib/entities/identifiers/sec-submissions.ts    | 21 ++++++++++--
 src/lib/facts/providers/sec-acceptance.test.ts     | 40 ++++++++++++++++------
 src/lib/facts/providers/sec-acceptance.ts          | 39 ++++++++++++++-------
 src/lib/facts/sync.test.ts                         |  8 +++++
 src/lib/facts/sync.ts                              |  4 +--
 7 files changed, 116 insertions(+), 39 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || cat "$d/$f"; done; done; git show 8118c46 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-zHLGVmzY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-k0Re484Y' (errno=Operation not permitted)
commit 8118c46d5e1841a79dd97fa42a4af1616c246ade
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:53:41 2026 -0800

    fix(facts): acceptance data properties are informational, 3-year lookback with --full-history, conflict-safe filingsByAccession, single-query E7 report (Task 12 quality review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/facts/enrich-acceptance.ts b/scripts/facts/enrich-acceptance.ts
index 134ea59..a84a055 100644
--- a/scripts/facts/enrich-acceptance.ts
+++ b/scripts/facts/enrich-acceptance.ts
@@ -1,7 +1,7 @@
 /**
  * SEC acceptance times for edgar filings (plan 3 spec §4.5, E7).
  *
- *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--apply]
+ *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts [--issuer <ticker>]... [--apply] [--full-history]
  *   node --env-file=.env.local --import tsx scripts/facts/enrich-acceptance.ts --report
  *
  * Without --issuer: every US fact_sync_scope row with priority > 0 (fetch_key = 10-digit CIK);
@@ -10,6 +10,7 @@
  * no batch, no database write. --apply: one ingest batch (producer enrich-acceptance, dataset
  * DATASETS.acceptance, triggered_by script, code version required), set_filing_acceptance per
  * filing, raw submissions into the reconcile-raw bucket, freshness recorded (daily).
+ * Pending filings older than 3 years are skipped (acceptance_out_of_window); --full-history (with --issuer only) lifts that bound.
  * --report (alone): the E7 measure — edgar filings of in-scope US issuers with accepted_at / all —
  * as one JSON line (target ≥ 0.99; a miss is reported as the real number, never padded).
  * sec.filing_date_vs_submissions results are listed per issuer; they are written once plan-3
@@ -17,7 +18,7 @@
  * Exit 0 on success, 1 when the batch (or, in a dry run, any issuer) failed, 2 on bad arguments.
  */
 import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
-import {emptyCounts,finishBatch,startBatch} from '../../src/lib/dq/batches';
+import {emptyCounts,finishBatch,isInfoError,startBatch} from '../../src/lib/dq/batches';
 import type {BatchCounts,BatchError} from '../../src/lib/dq/batches';
 import {DATASETS} from '../../src/lib/dq/datasets';
 import {recordAttempt} from '../../src/lib/dq/freshness';
@@ -30,31 +31,32 @@ import type {AcceptanceDeps} from '../../src/lib/facts/providers/sec-acceptance'
 import {makeBudget,resolveCodeVersion} from '../../src/lib/facts/sync';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
-const USAGE='usage: enrich-acceptance.ts [--issuer <ticker>]... [--apply] | --report';
+const USAGE='usage: enrich-acceptance.ts [--issuer <ticker>]... [--full-history] [--apply] | --report';
 const E7_TARGET=0.99;
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 
 async function report():Promise<void>{
  const tables=supabaseTableClient(getAdminSupabase());
  const scope=(await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(r=>Number(r.priority)>0);
+ const ids=new Set(scope.map(r=>String(r.issuer_id)));
  let total=0,accepted=0;
- for(const s of scope){
-  const issuer_id=String(s.issuer_id);
-  total+=await tables.count('filings',{issuer_id,market:'US',source:'edgar'});
-  accepted+=await tables.count('filings',{issuer_id,market:'US',source:'edgar'},{gte:{accepted_at:'1900-01-01T00:00:00Z'}});   // gte excludes null
+ for(const f of await selectAll(tables,'filings',{market:'US',source:'edgar'},'filing_id')){   // one query for all issuers, grouped here
+  if(!ids.has(String(f.issuer_id)))continue;
+  total++;if(f.accepted_at!==null&&f.accepted_at!==undefined)accepted++;
  }
  const rate=total===0?null:accepted/total;
  console.log(JSON.stringify({measure:'E7',issuers:scope.length,edgar_filings:total,with_accepted_at:accepted,rate,target:E7_TARGET,meets:rate!==null&&rate>=E7_TARGET}));
 }
 
 async function main():Promise<void>{
- const argv=process.argv.slice(2);let apply=false,doReport=false;const tickers:string[]=[];
+ const argv=process.argv.slice(2);let apply=false,doReport=false,fullHistory=false;const tickers:string[]=[];
  for(let i=0;i<argv.length;i++){
   const x=argv[i],v=argv[i+1];
-  if(x==='--apply')apply=true;else if(x==='--report')doReport=true;else if(x==='--issuer'&&v){tickers.push(v);i++;}
+  if(x==='--apply')apply=true;else if(x==='--full-history')fullHistory=true;else if(x==='--report')doReport=true;else if(x==='--issuer'&&v){tickers.push(v);i++;}
   else{console.error(USAGE);process.exit(2);}
  }
- if(doReport){if(apply||tickers.length>0){console.error(USAGE);process.exit(2);}await report();return;}
+ if(fullHistory&&tickers.length===0){console.error('--full-history needs --issuer');process.exit(2);}
+ if(doReport){if(apply||fullHistory||tickers.length>0){console.error(USAGE);process.exit(2);}await report();return;}
  const sb=getAdminSupabase();const tables=supabaseTableClient(sb);const db=supabaseFactsDb(sb);
  const today=new Date().toISOString().slice(0,10);
  let issuers:{issuerId:string;cik10:string;label:string}[]=[];
@@ -77,10 +79,10 @@ async function main():Promise<void>{
  const budget=makeBudget(null);
  for(const it of issuers){
   try{
-   const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom})},{issuerId:it.issuerId,cik10:it.cik10},budget);
+   const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom})},{issuerId:it.issuerId,cik10:it.cik10},budget,{fullHistory});
    for(const k of Object.keys(counts) as (keyof BatchCounts)[])counts[k]+=out.counts[k];
    errors.push(...out.errors);mismatches+=out.mismatches.length;
-   if(out.counts.failed>0||out.errors.some(e=>e.code!=='skipped_summary'))issuerFailures++;
+   if(out.counts.failed>0||out.errors.some(e=>!isInfoError(e)))issuerFailures++;
    console.log(JSON.stringify({issuer:it.issuerId,label:it.label,counts:out.counts,errors:out.errors.map(e=>e.code),date_mismatches:out.mismatches.map(m=>m.natural_key)}));
   }catch(e){
    issuerFailures++;errors.push({code:'unknown',key:it.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});
diff --git a/src/lib/entities/identifiers/sec-submissions.test.ts b/src/lib/entities/identifiers/sec-submissions.test.ts
index 75ad8d2..3ead19a 100644
--- a/src/lib/entities/identifiers/sec-submissions.test.ts
+++ b/src/lib/entities/identifiers/sec-submissions.test.ts
@@ -8,7 +8,7 @@ import {fetchCompanyFacts} from '../../facts/providers/edgar-companyfacts';
 import {sanitizeProvenance} from '../provenance';
 import {
  SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
- submissionsCategory,submissionsClient,submissionsEvidenceClaims,submissionsUrl,
+ conflictingAccessions,submissionsCategory,submissionsClient,submissionsEvidenceClaims,submissionsUrl,
 } from './sec-submissions';
 
 const read=(rel:string)=>readFileSync(new URL(rel,import.meta.url),'utf8');
@@ -166,3 +166,18 @@ describe('submissionsEvidenceClaims',()=>{
   for(const c of claims)expect(()=>sanitizeProvenance({valid_from:c.detail.evidence},['valid_from'])).not.toThrow();
  });
 });
+
+describe('conflicting copies of one accession (Task 12 review)',()=>{
+ const f=(page:string,accepted:string):import('./sec-submissions').SubmissionFiling=>({accessionNumber:'0000999001-01-000009',filingDate:'2001-02-05',reportDate:null,acceptanceDateTime:accepted,form:'8-A12B',primaryDocument:null,isInlineXBRL:null,page});
+ const parsed=(filings:import('./sec-submissions').SubmissionFiling[])=>({...parseSubmissions(MAIN),filings});
+ it('filingsByAccession leaves a conflicting accession out instead of last-wins; agreeing copies stay',()=>{
+  const bad=parsed([f('recent','2001-02-05T12:00:00.000Z'),f('p1','2001-02-05T13:00:00.000Z')]);
+  expect([...conflictingAccessions(bad.filings)]).toEqual(['0000999001-01-000009']);
+  expect(filingsByAccession(bad).has('0000999001-01-000009')).toBe(false);
+  expect(filingsByAccession(parsed([f('recent','2001-02-05T12:00:00.000Z'),f('p1','2001-02-05T12:00:00.000Z')])).get('0000999001-01-000009')?.page).toBe('recent');
+ });
+ it('submissionsEvidenceClaims files one claim per accession',()=>{
+  const snap={cik:'999001',fetchedAt:'x',main:{name:'main',sha256:'a'.repeat(64),path:'p'},pages:[{name:'p1',sha256:'b'.repeat(64),path:'q'}],parsed:parsed([f('recent','2001-02-05T12:00:00.000Z'),f('p1','2001-02-05T13:00:00.000Z')]),complete:true};
+  expect(submissionsEvidenceClaims(ISSUER,snap,'2026-11-05')).toHaveLength(1);
+ });
+});
diff --git a/src/lib/entities/identifiers/sec-submissions.ts b/src/lib/entities/identifiers/sec-submissions.ts
index ad331dd..8e461e4 100644
--- a/src/lib/entities/identifiers/sec-submissions.ts
+++ b/src/lib/entities/identifiers/sec-submissions.ts
@@ -3,7 +3,9 @@
 // One fetch per CIK serves several consumers. submissionsClient paces requests (declared
 // User-Agent; at least SEC_MIN_INTERVAL_MS apart within one client), stores the exact bytes of the
 // main document and of each fetched filings.files[] page in reconcile-raw, and returns the parsed,
-// merged snapshot. Parsers are pure and strict about the columnar `filings.recent` shape (every
+// merged snapshot. An accession repeated across pages is kept once when the copies agree; copies that
+// disagree on filingDate/acceptanceDateTime are ALL kept (consumers see the conflict: filingsByAccession
+// leaves such an accession out, acceptance enrichment skips it). Parsers are pure and strict about the columnar `filings.recent` shape (every
 // column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
 // never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
 import type {Budget} from '../../facts/types';
@@ -174,7 +176,19 @@ export function submissionsClient(deps:FetchSubmissionsDeps){
 }
 
 export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
-export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
+/** Accessions whose kept copies disagree on filingDate or acceptanceDateTime. */
+export function conflictingAccessions(filings:readonly SubmissionFiling[]):Set<string>{
+ const first=new Map<string,SubmissionFiling>();const bad=new Set<string>();
+ for(const f of filings){const s=first.get(f.accessionNumber);if(!s)first.set(f.accessionNumber,f);else if(s.filingDate!==f.filingDate||s.acceptanceDateTime!==f.acceptanceDateTime)bad.add(f.accessionNumber);}
+ return bad;
+}
+/** accession → filing; an accession with conflicting copies is left out (never last-wins). */
+export function filingsByAccession(parsed:ParsedSubmissions):Map<string,SubmissionFiling>{
+ const bad=conflictingAccessions(parsed.filings);
+ const m=new Map<string,SubmissionFiling>();
+ for(const f of parsed.filings)if(!bad.has(f.accessionNumber)&&!m.has(f.accessionNumber))m.set(f.accessionNumber,f);
+ return m;
+}
 
 export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
  '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
@@ -186,10 +200,13 @@ export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_windo
 /** One evidence_only claim per 8-A/25 filing; value = accession number (Part B contract issue 6). */
 export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
  const shaOf=(page:string)=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
+ const done=new Set<string>();
  return snap.parsed.filings.flatMap(f=>{
+  if(done.has(f.accessionNumber))return [];   // conflicting copies of one accession: one claim
   const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
   const sha=rule?shaOf(f.page):null;
   if(!rule||!sha)return [];
+  done.add(f.accessionNumber);
   const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
   return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
    schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
diff --git a/src/lib/facts/providers/sec-acceptance.test.ts b/src/lib/facts/providers/sec-acceptance.test.ts
index 0a4dc76..a3d15bb 100644
--- a/src/lib/facts/providers/sec-acceptance.test.ts
+++ b/src/lib/facts/providers/sec-acceptance.test.ts
@@ -1,5 +1,7 @@
 // src/lib/facts/providers/sec-acceptance.test.ts
-import {describe,expect,it,vi} from 'vitest';
+import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
+beforeAll(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-05T00:00:00Z'));});
+afterAll(()=>{vi.useRealTimers();});
 import {randomUUID} from 'node:crypto';
 import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
 import {filingInsert} from '../db-contract';
@@ -54,8 +56,8 @@ describe('enrichAcceptance (spec §4.5)',()=>{
   const submissions=vi.fn(async(_c:string,_b:Budget,_coverFrom:string)=>snap);
   const out=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
   expect(submissions).toHaveBeenCalledWith('0000320193',budget,'2024-01-25');   // coverFrom = earliest pending available_date − 7 days (plan audit R3)
-  expect(out.counts).toMatchObject({fetched:2,inserted:1,duplicates:0,failed:1});
-  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2})}]);
+  expect(out.counts).toEqual({fetched:1,inserted:1,duplicates:0,versioned:0,quarantined:0,failed:0});   // mismatch / not-found are data properties, not failures
+  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,acceptance_mismatch:1})}]);
   expect(record).toHaveBeenCalledTimes(1);
   expect(record.mock.calls[0][0]).toEqual({natural_key:`320193:${mismatch.sourceRef}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
    left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
@@ -64,7 +66,7 @@ describe('enrichAcceptance (spec §4.5)',()=>{
   expect((await db.findFilingBySourceRef('edgar',mismatch.sourceRef))!.accepted_at).toBeNull();
   // second pass: the accepted filing is no longer pending; the mismatch is reported again
   const again=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
-  expect(again.counts).toMatchObject({fetched:1,inserted:0,failed:1});
+  expect(again.counts).toMatchObject({fetched:0,inserted:0,failed:0});
   expect(submissions.mock.calls[1][2]).toBe('2024-04-25');                       // the accepted 2024-02-01 filing no longer widens the window
  });
  it('a pending accession listed only in a historical files[] page is fetched through coverFrom and written; a mismatch there cites that page and its hash (plan audit R3)',async()=>{
@@ -91,14 +93,14 @@ describe('enrichAcceptance (spec §4.5)',()=>{
   const {db,iss,snap}=await seeded();
   const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:'0000320193'},budget);
   expect(out.mismatches).toHaveLength(1);
-  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,filing_date_mismatch_unrecorded:1})}]);
+  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,acceptance_mismatch:1,filing_date_mismatch_unrecorded:1})}]);
  });
  it('acceptance_conflict counts as failed with its own error; the same value again is a duplicate; other errors are thrown',async()=>{
   const {db,iss,ok,snap}=await seeded();
   const conflicting={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new FactsDbError('acceptance_conflict');})};
   const out=await enrichAcceptance({db:conflicting,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
-  expect(out.counts).toMatchObject({fetched:2,inserted:0,failed:2});
-  expect(out.errors).toContainEqual({code:'acceptance_conflict',key:ok.sourceRef});
+  expect(out.counts).toMatchObject({fetched:1,inserted:0,failed:1});
+  expect(out.errors.filter(e=>e.code==='acceptance_conflict')).toEqual([{code:'acceptance_conflict',key:ok.sourceRef}]);   // one error per cause
   const dup={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>false)};
   expect((await enrichAcceptance({db:dup,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).counts).toMatchObject({duplicates:1});
   const broken={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new Error('db down');})};
@@ -125,8 +127,8 @@ describe('enrichAcceptance review fixes (Task 12 Codex)',()=>{
   await db.stageFilings(run,[a,c]);await db.publishRun(run,[a.filing_id,c.filing_id]);
   const snap=snapshot([entry(a.sourceRef,'2024-02-02',null),entry(c.sourceRef,'2024-03-01','bad')]);
   const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:cik},budget);
-  expect(out.mismatches).toHaveLength(1);expect(out.counts).toMatchObject({fetched:1,failed:1,inserted:0});
-  expect(out.errors[0].message).toContain('"acceptance_not_found":1');
+  expect(out.mismatches).toHaveLength(1);expect(out.counts).toMatchObject({fetched:0,failed:0,inserted:0});
+  expect(out.errors[0].message).toBe(JSON.stringify({acceptance_not_found:1,acceptance_mismatch:1,filing_date_mismatch_unrecorded:1}));
  });
  it('stops starting writes when the budget is spent and reports deadline_hit with the remaining count',async()=>{
   const {db,iss,snap}=await seeded();
@@ -145,6 +147,24 @@ describe('enrichAcceptance review fixes (Task 12 Codex)',()=>{
   const out=await enrichAcceptance({db,submissions:(c,bb,from)=>fetchSubmissions(c,{fetch:fetchStub,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),sleep:async()=>{},now:()=>0,budget:bb},{coverFrom:from}),recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},budget);
   expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBeNull();
   expect(out.errors[0].message).toContain('"acceptance_ambiguous":1');
-  expect(out.counts.failed).toBeGreaterThanOrEqual(1);
+  expect(out.counts).toMatchObject({fetched:0,failed:0});   // ambiguity is informational
+ });
+ it('pending filings older than ACCEPTANCE_LOOKBACK_DAYS are out of the pass and of coverFrom (info count); fullHistory lifts the bound',async()=>{
+  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
+  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:cik}]);await db.claimLease(iss,'US',b,600);
+  const run=await db.beginRun(iss,'US',b,1);
+  const old=filingInsert(iss,{sourceRef:'0000320193-20-000001',availableDate:'2020-01-01'}),fresh=filingInsert(iss,{sourceRef:'0000320193-26-000001',availableDate:'2026-06-01'});
+  await db.stageFilings(run,[old,fresh]);await db.publishRun(run,[old.filing_id,fresh.filing_id]);
+  const snap=snapshot([entry(old.sourceRef,'2020-01-01','2020-01-01T10:00:00.000Z'),entry(fresh.sourceRef,'2026-06-01','2026-06-01T10:00:00.000Z')]);
+  const submissions=vi.fn(async(_c:string,_b:Budget,_f:string)=>snap);
+  const out=await enrichAcceptance({db,submissions},{issuerId:iss,cik10:cik},budget);
+  expect(submissions.mock.calls[0][2]).toBe('2026-05-25');
+  expect(out.counts).toMatchObject({inserted:1});
+  expect((await db.findFilingBySourceRef('edgar',old.sourceRef))!.accepted_at).toBeNull();
+  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_out_of_window:1})}]);
+  const full=await enrichAcceptance({db,submissions},{issuerId:iss,cik10:cik},budget,{fullHistory:true});
+  expect(submissions.mock.calls[1][2]).toBe('2019-12-25');
+  expect(full.counts).toMatchObject({inserted:1});
+  expect((await db.findFilingBySourceRef('edgar',old.sourceRef))!.accepted_at).toBe('2020-01-01T10:00:00.000Z');
  });
 });
diff --git a/src/lib/facts/providers/sec-acceptance.ts b/src/lib/facts/providers/sec-acceptance.ts
index 053e138..c4f6b71 100644
--- a/src/lib/facts/providers/sec-acceptance.ts
+++ b/src/lib/facts/providers/sec-acceptance.ts
@@ -8,13 +8,17 @@
 // filing of the issuer whose accepted_at is null:
 //  - in the snapshot with an acceptance time and filingDate = available_date →
 //    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
-//    false (same value already) → duplicates, acceptance_conflict → failed + error;
+//    false (same value already) → duplicates, acceptance_conflict → failed + one error per filing;
 //  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
 //    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
 //    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
-//  - absent, ambiguous, or without a parseable acceptance time → skipped_summary
-//    (acceptance_not_found / acceptance_ambiguous); never a guessed time.
-// fetched counts the filings that reached a decision. A submissions failure → sec_unavailable.
+//  - absent, ambiguous (conflicting copies), or without a parseable acceptance time → never a guessed time.
+// Mismatches, ambiguous and not-found filings are DATA properties: they are counted under the informational
+// skipped_summary (acceptance_mismatch / acceptance_ambiguous / acceptance_not_found), never in `failed`.
+// Pending filings older than ACCEPTANCE_LOOKBACK_DAYS are left out of the pass and of coverFrom
+// (acceptance_out_of_window) unless opts.fullHistory. Only real failures (acceptance_conflict, write
+// errors, sec_unavailable) count as failed.
+// fetched counts the filings for which a write was attempted. A submissions failure → sec_unavailable.
 import {emptyCounts} from '../../dq/batches';
 import type {BatchCounts,BatchError} from '../../dq/batches';
 import type {ReconcileResultInput} from '../../dq/reconcile/types';
@@ -22,6 +26,8 @@ import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifi
 import {FactsDbError} from '../types';
 import type {Budget,FactsDb,FilingRow} from '../types';
 
+/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
+export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
 export const ACCEPTANCE_SOURCE='sec_submissions' as const;
 export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
 /** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
@@ -34,7 +40,10 @@ export interface AcceptanceDeps{
  submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
  /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
  recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
+ /** clock for the lookback window (default: real time) */
+ now?:()=>Date;
 }
+export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
 export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}
 
 const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
@@ -74,10 +83,14 @@ export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,page
    :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
 }
 
-export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget):Promise<AcceptanceOutcome>{
+export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
  const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
- const pending=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
- if(pending.length===0)return out;
+ const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
+ const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
+ const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
+ const outOfWindow=all.length-pending.length;
+ const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
+ if(pending.length===0)return outSummary();
  let snap:SubmissionsSnapshot;
  try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
  catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
@@ -85,25 +98,25 @@ export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:stri
  const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
  const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
  const amb=new Set(ambiguous);
- let notFound=0,unrecorded=0,ambiguousHit=0;
+ let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
  for(let i=0;i<pending.length;i++){
   const f=pending[i];
   if(budget.signal.aborted||budget.remainingMs()<=0){
    out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
   }
-  if(amb.has(f.source_ref)){out.counts.fetched++;out.counts.failed++;ambiguousHit++;continue;}   // conflicting copies: never guess
+  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
   const e=index.get(f.source_ref);
   if(!e){notFound++;continue;}
-  out.counts.fetched++;
   if(e.filingDate!==f.available_date){
-   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
+   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
    if(deps.recordDateMismatch){
     try{await deps.recordDateMismatch(r);}
     catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
    }else unrecorded++;
    continue;
   }
-  if(e.acceptedAt===null){out.counts.fetched--;notFound++;continue;}
+  if(e.acceptedAt===null){notFound++;continue;}
+  out.counts.fetched++;
   try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
   catch(err){
    if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
@@ -113,7 +126,9 @@ export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:stri
  const summary:Record<string,number>={};
  if(notFound>0)summary.acceptance_not_found=notFound;
  if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
+ if(mismatch>0)summary.acceptance_mismatch=mismatch;
  if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
+ if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
  if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
  return out;
 }
diff --git a/src/lib/facts/sync.test.ts b/src/lib/facts/sync.test.ts
index 6f92bff..c0e31d8 100644
--- a/src/lib/facts/sync.test.ts
+++ b/src/lib/facts/sync.test.ts
@@ -615,6 +615,14 @@ describe('runFactsSync — step 9b acceptance (plan 3 §4.5)',()=>{
   expect(r.issuers[0].errors).toContainEqual({code:'acceptance_failed',key:ISSUER,message:'{"failed":2}'});
   expect(r.status).toBe('partial');
  });
+ it('per-filing non-info errors already explain failed: no extra aggregate acceptance_failed',async()=>{
+  const o={...outcome([{code:'acceptance_conflict',key:'acc-1'}]),counts:{fetched:1,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:1}};
+  const {deps}=harness(FY23,{enrichAcceptance:async()=>o});
+  const r=await run(deps);
+  expect(r.issuers[0].errors.filter(e=>e.code==='acceptance_failed')).toEqual([]);
+  expect(r.issuers[0].errors).toContainEqual({code:'acceptance_conflict',key:'acc-1'});
+  expect(r.status).toBe('partial');
+ });
  it('is not called for CN',async()=>{
   const enrichAcceptance=vi.fn(async()=>outcome([]));
   const {deps}=harness(parsed([cnFiling()],[cnRevenue()]),{enrichAcceptance},CN_SCOPE);
diff --git a/src/lib/facts/sync.ts b/src/lib/facts/sync.ts
index ec0d0e3..0f9fcca 100644
--- a/src/lib/facts/sync.ts
+++ b/src/lib/facts/sync.ts
@@ -7,7 +7,7 @@
 import {execFileSync} from 'node:child_process';
 import {createHash,randomUUID} from 'node:crypto';
 import type {TableClient} from '../db/table-client';
-import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
+import {emptyCounts,finishBatch,isInfoError,startBatch} from '../dq/batches';
 import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
 import {recordAttempt} from '../dq/freshness';
 import {quarantine} from '../dq/quarantine';
@@ -291,7 +291,7 @@ export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:
   if(market==='US'&&deps.enrichAcceptance&&!budget.signal.aborted&&budget.remainingMs()>0){
    try{
     const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);out.acceptance=a.counts;
-    if(a.counts.failed>0)out.errors.push({code:'acceptance_failed',key:issuer,message:JSON.stringify({failed:a.counts.failed})});   // non-informational: the batch is partial, the issuer stays published
+    if(a.counts.failed>0&&!a.errors.some(x=>!isInfoError(x)))out.errors.push({code:'acceptance_failed',key:issuer,message:JSON.stringify({failed:a.counts.failed})});   // only when no per-filing error already says why (those are non-informational too): the batch is partial, the issuer stays published
    }
    catch(e){out.errors.push({code:'acceptance_failed',key:issuer,message:errMsg(e)});}
   }

exec
/bin/zsh -lc "cat src/lib/db/table-client.ts; cat src/lib/facts/providers/sec-acceptance.ts; sed -n '90,180p' src/lib/entities/identifiers/sec-submissions.ts; cat src/lib/dq/batches.ts | head -140; rg 'filingsByAccession|enrichAcceptance\\(' src scripts; find . -iname '*agents*' -o -name CLAUDE.md | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 131ms:
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
// src/lib/facts/providers/sec-acceptance.ts
// SEC acceptance times (plan 3 spec §4.5; step 9b of the US facts sync; E7). One submissions
// snapshot (sec-submissions.ts: `parsed.filings` = filings.recent plus any fetched files[] pages; the
// main document's raw bytes are in the reconcile-raw bucket under main.sha256, each page's under its own
// sha256) is indexed by accessionNumber. The snapshot is fetched with coverFrom = the earliest pending
// available_date − 7 days (plan audit R3), so every files[] page that can hold a pending filing is fetched:
// a filing listed only in a historical page is written, never left acceptance_not_found. Every edgar
// filing of the issuer whose accepted_at is null:
//  - in the snapshot with an acceptance time and filingDate = available_date →
//    set_filing_acceptance(filing, acceptanceDateTime, 'sec_submissions'): true → inserted,
//    false (same value already) → duplicates, acceptance_conflict → failed + one error per filing;
//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
//  - absent, ambiguous (conflicting copies), or without a parseable acceptance time → never a guessed time.
// Mismatches, ambiguous and not-found filings are DATA properties: they are counted under the informational
// skipped_summary (acceptance_mismatch / acceptance_ambiguous / acceptance_not_found), never in `failed`.
// Pending filings older than ACCEPTANCE_LOOKBACK_DAYS are left out of the pass and of coverFrom
// (acceptance_out_of_window) unless opts.fullHistory. Only real failures (acceptance_conflict, write
// errors, sec_unavailable) count as failed.
// fetched counts the filings for which a write was attempted. A submissions failure → sec_unavailable.
import {emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import type {ReconcileResultInput} from '../../dq/reconcile/types';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

/** Pending filings older than this (days before today) are not looked up unless fullHistory. */
export const ACCEPTANCE_LOOKBACK_DAYS=3*365;
export const ACCEPTANCE_SOURCE='sec_submissions' as const;
export const DATE_MISMATCH_PAIR='sec.filing_date_vs_submissions' as const;
/** page = the SubmissionFiling page ('recent' = the main document, else the files[] page name), kept per entry for mismatch evidence. */
export interface AcceptanceEntry{accessionNumber:string;filingDate:string;form:string;acceptedAt:string|null;page:string}
/** Margin before the earliest pending available_date: a mismatching filingDate may precede it. */
export const ACCEPTANCE_COVER_MARGIN_DAYS=7;
export interface AcceptanceDeps{
 db:Pick<FactsDb,'filingsOfIssuer'|'setFilingAcceptance'>;
 /** coverFrom ('YYYY-MM-DD') is passed to fetchSubmissions: every files[] page with filingTo >= coverFrom is fetched (plan audit R3). */
 submissions:(cik10:string,b:Budget,coverFrom:string)=>Promise<SubmissionsSnapshot>;
 /** records one sec.filing_date_vs_submissions result (record.ts, plan-3 Part D); absent → returned in `mismatches` only */
 recordDateMismatch?:(r:ReconcileResultInput)=>Promise<void>;
 /** clock for the lookback window (default: real time) */
 now?:()=>Date;
}
export interface AcceptanceOptions{/** lift the ACCEPTANCE_LOOKBACK_DAYS bound (script --full-history) */fullHistory?:boolean}
export interface AcceptanceOutcome{issuerId:string;counts:BatchCounts;errors:BatchError[];mismatches:ReconcileResultInput[];snapshotSha256:string|null}

const SEC_TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** SEC acceptanceDateTime ('2024-11-01T06:01:36.000Z', UTC) → ISO; anything else (incl. rolled-over dates) → null. */
export function parseAcceptanceDateTime(v:unknown):string|null{
 if(typeof v!=='string'||!SEC_TS.test(v))return null;
 const ms=Date.parse(v);if(!Number.isFinite(ms))return null;
 const iso=new Date(ms).toISOString();
 return iso.slice(0,19)===v.slice(0,19)?iso:null;
}
/** accessionNumber → entry. An accession listed twice with different filing dates or acceptance times is ambiguous and left out. */
export function acceptanceIndex(entries:readonly SubmissionFiling[]):{index:Map<string,AcceptanceEntry>;ambiguous:string[]}{
 const index=new Map<string,AcceptanceEntry>();const bad=new Set<string>();
 for(const e of entries){
  const x:AcceptanceEntry={accessionNumber:e.accessionNumber,filingDate:e.filingDate,form:e.form,acceptedAt:parseAcceptanceDateTime(e.acceptanceDateTime),page:e.page};
  const seen=index.get(x.accessionNumber);
  if(seen&&(seen.filingDate!==x.filingDate||seen.acceptedAt!==x.acceptedAt))bad.add(x.accessionNumber);
  else if(!seen)index.set(x.accessionNumber,x);
 }
 for(const a of bad)index.delete(a);
 return {index,ambiguous:[...bad].sort()};
}
/** earliest pending available_date − ACCEPTANCE_COVER_MARGIN_DAYS, as YYYY-MM-DD. */
export function acceptanceCoverFrom(pending:readonly Pick<FilingRow,'available_date'>[]):string{
 const min=pending.map(f=>f.available_date).sort()[0];
 const d=new Date(`${min}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-ACCEPTANCE_COVER_MARGIN_DAYS);
 return d.toISOString().slice(0,10);
}
/** sha256 of the document an entry came from: the main document for 'recent', else that files[] page (null if not fetched). */
export const pageSha256=(snap:SubmissionsSnapshot,page:string):string|null=>page==='recent'?snap.main.sha256:snap.pages.find(p=>p.name===page)?.sha256??null;
/** The sec.filing_date_vs_submissions result of one filing (natural key <cik>:<accession>, dates compared as text); the right side cites the entry's own page and hash. */
export function filingDateMismatch(cik:string,f:FilingRow,e:AcceptanceEntry,pageSha:string|null):ReconcileResultInput{
 return {natural_key:`${cik}:${f.source_ref}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
  left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
  detail:{left_text:f.available_date,right_text:e.filingDate,left:{filing_id:f.filing_id,source_ref:f.source_ref},right:e.page==='recent'
   ?{document:'submissions',sha256:pageSha,locator:`filings.recent[accessionNumber=${e.accessionNumber}]`}
   :{document:e.page,sha256:pageSha,locator:`${e.page}[accessionNumber=${e.accessionNumber}]`}}};
}

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const all=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 const cutoff=new Date((deps.now?.()??new Date()).getTime()-ACCEPTANCE_LOOKBACK_DAYS*86_400_000).toISOString().slice(0,10);
 const pending=opts.fullHistory?all:all.filter(f=>f.available_date>=cutoff);
 const outOfWindow=all.length-pending.length;
 const outSummary=()=>{if(outOfWindow>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({acceptance_out_of_window:outOfWindow})});return out;};
 if(pending.length===0)return outSummary();
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0,mismatch=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);mismatch++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){notFound++;continue;}
  out.counts.fetched++;
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(mismatch>0)summary.acceptance_mismatch=mismatch;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(outOfWindow>0)summary.acceptance_out_of_window=outOfWindow;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
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
   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
   const sig=(f:SubmissionFiling)=>`${f.accessionNumber}|${f.filingDate}|${f.acceptanceDateTime??''}`;
   const seen=new Set(filings.map(sig));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(sig(x))){seen.add(sig(x));filings.push(x);}
   }
   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
  },
 };
}

export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
/** Accessions whose kept copies disagree on filingDate or acceptanceDateTime. */
export function conflictingAccessions(filings:readonly SubmissionFiling[]):Set<string>{
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
scripts/facts/enrich-acceptance.ts:   const out=await enrichAcceptance({db:writes,submissions:(c,b,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw,budget:b},{coverFrom})},{issuerId:it.issuerId,cik10:it.cik10},budget,{fullHistory});
src/lib/facts/sync.ts:    const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);out.acceptance=a.counts;
src/lib/entities/identifiers/sec-submissions.test.ts: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
src/lib/entities/identifiers/sec-submissions.test.ts:  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
src/lib/entities/identifiers/sec-submissions.test.ts: it('filingsByAccession leaves a conflicting accession out instead of last-wins; agreeing copies stay',()=>{
src/lib/entities/identifiers/sec-submissions.test.ts:  expect(filingsByAccession(bad).has('0000999001-01-000009')).toBe(false);
src/lib/entities/identifiers/sec-submissions.test.ts:  expect(filingsByAccession(parsed([f('recent','2001-02-05T12:00:00.000Z'),f('p1','2001-02-05T12:00:00.000Z')])).get('0000999001-01-000009')?.page).toBe('recent');
src/lib/entities/identifiers/sec-submissions.ts:// disagree on filingDate/acceptanceDateTime are ALL kept (consumers see the conflict: filingsByAccession
src/lib/entities/identifiers/sec-submissions.ts:export function filingsByAccession(parsed:ParsedSubmissions):Map<string,SubmissionFiling>{
src/lib/facts/deps.ts:  enrichAcceptance:(issuer,cik10,b)=>enrichAcceptance({db,submissions:(c,bb,coverFrom)=>fetchSubmissions(c,{fetch,userAgent:process.env.EDGAR_USER_AGENT,raw:supabaseRawStore(sb),budget:bb},{coverFrom})},{issuerId:issuer,cik10},b),
src/lib/facts/providers/sec-acceptance.ts:export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget,opts:AcceptanceOptions={}):Promise<AcceptanceOutcome>{
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const again=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  await enrichAcceptance({db:db2,submissions:async()=>moved,recordDateMismatch:record},{issuerId:iss2,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db:conflicting,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  expect((await enrichAcceptance({db:dup,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).counts).toMatchObject({duplicates:1});
src/lib/facts/providers/sec-acceptance.test.ts:  await expect(enrichAcceptance({db:broken,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).rejects.toThrow('db down');
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions:async()=>{throw new Error('404');}},{issuerId:iss,cik10:'0000320193'},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  expect((await enrichAcceptance({db,submissions:none},{issuerId:randomUUID(),cik10:'0000000001'},budget)).counts.fetched).toBe(0);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:cik},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},b);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions:(c,bb,from)=>fetchSubmissions(c,{fetch:fetchStub,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),sleep:async()=>{},now:()=>0,budget:bb},{coverFrom:from}),recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const out=await enrichAcceptance({db,submissions},{issuerId:iss,cik10:cik},budget);
src/lib/facts/providers/sec-acceptance.test.ts:  const full=await enrichAcceptance({db,submissions},{issuerId:iss,cik10:cik},budget,{fullHistory:true});
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents

codex
No actionable regressions were identified in the changed code or its callers. The lookback filtering, informational error handling, and conflict-safe accession indexing are consistent with the intended changes. Tests were inspected but not executed.
No actionable regressions were identified in the changed code or its callers. The lookback filtering, informational error handling, and conflict-safe accession indexing are consistent with the intended changes. Tests were inspected but not executed.

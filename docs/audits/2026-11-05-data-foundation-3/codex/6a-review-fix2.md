OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b022-558d-72f0-b353-a4d25519e3a1
--------
user
commit 4f42c19
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 4f42c19; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 224ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-amvCQvz3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DCc17Z7z' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oS5B2DGU' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-MFL9sZgV' (errno=Operation not permitted)
4f42c19 fix(entities): submissions review round 2 (raw ticker index, one SEC pacer, failure evidence linkage, window_conflict)
 scripts/entity-keys/sec-submissions.ts             | 11 ++++--
 .../entities/identifiers/sec-submissions.test.ts   | 21 ++++++++++--
 src/lib/entities/identifiers/sec-submissions.ts    | 39 ++++++++++++++--------
 src/lib/entities/submissions-evidence.test.ts      | 12 +++++++
 src/lib/entities/submissions-evidence.ts           | 14 +++++---
 src/lib/facts/providers/edgar-companyfacts.ts      |  6 ++--
 src/lib/facts/providers/shared.ts                  |  3 ++
 7 files changed, 81 insertions(+), 25 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show 4f42c19' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: error: couldn't create cache file '/tmp/xcrun_db-mL5RDIuW' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mblgs28h' (errno=Operation not permitted)
commit 4f42c1946b85c69bf338d9b52ab57cd267649acc
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:13:07 2026 -0800

    fix(entities): submissions review round 2 (raw ticker index, one SEC pacer, failure evidence linkage, window_conflict)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/sec-submissions.ts b/scripts/entity-keys/sec-submissions.ts
index bfa9b65..e0a5be3 100644
--- a/scripts/entity-keys/sec-submissions.ts
+++ b/scripts/entity-keys/sec-submissions.ts
@@ -15,6 +15,7 @@ import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
 import {SUBMISSIONS_PARSER_VERSION,SecSubmissionsError,submissionsClient,submissionsEvidenceClaims} from '../../src/lib/entities/identifiers/sec-submissions';
 import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
 import {applySubmissionsEvidence} from '../../src/lib/entities/submissions-evidence';
+import {normalizeSecurityTicker} from '../../src/lib/securities/ticker';
 import {getAdminSupabase} from '../../src/lib/supabase/admin';
 
 const DATASET=DATASETS.entities.submissions;
@@ -48,18 +49,22 @@ async function main(){
    try{
     const snapshot=await client.fetch(cik,{coverFrom:ALL_PAGES});
     const open=await tables.select('issuer_securities',{issuer_id:issuerId,valid_to:null},{orderBy:'ticker'});
-    const primary=[...open].sort((a,b)=>Number(b.is_primary===true)-Number(a.is_primary===true))[0];
+    // aliases attach to the issuer's primary row only; with no is_primary row there is no primary (apply then skips the names)
+    const primary=open.find(r=>r.is_primary===true);
     const primaryTicker=primary?String(primary.ticker):null;
     if(!batchId){
+     // the preview fetches every page too (coverFrom=ALL_PAGES) but writes nothing
+     const normalized=snapshot.parsed.tickers.map(t=>universe.has(t)?t:normalizeSecurityTicker(t,'US'));
      preview.push({cik,formerNames:snapshot.parsed.formerNames.length,evidenceClaims:submissionsEvidenceClaims(issuerId,snapshot,asOf).length,
-      secOnlyTickers:snapshot.parsed.tickers.filter(t=>!open.some(r=>r.ticker===t)),pages:snapshot.pages.length,complete:snapshot.complete});
+      secOnlyTickers:normalized.filter((t):t is string=>t!==null&&universe.has(t)&&!open.some(r=>r.ticker===t)),pages:snapshot.pages.length,complete:snapshot.complete});
      continue;
     }
     const res=await applySubmissionsEvidence(tables,{issuerId,primaryTicker,snapshot,asOf,batchId,dataset:DATASET,universe});
     add(counts,res.counts);errors=[...errors,...res.errors];
    }catch(e){
     counts.failed++;
-    errors.push({code:e instanceof SecSubmissionsError?e.code:'exception',key:cik,message:errorMessage(e)});
+    const raw=e instanceof SecSubmissionsError&&e.raw?` [raw sha256=${e.raw.sha256} path=${e.raw.path}]`:'';
+    errors.push({code:e instanceof SecSubmissionsError?e.code:'exception',key:cik,message:errorMessage(e)+raw});
    }
   }
  }finally{
diff --git a/src/lib/entities/identifiers/sec-submissions.test.ts b/src/lib/entities/identifiers/sec-submissions.test.ts
index d4ed6c8..75ad8d2 100644
--- a/src/lib/entities/identifiers/sec-submissions.test.ts
+++ b/src/lib/entities/identifiers/sec-submissions.test.ts
@@ -3,7 +3,8 @@ import {readFileSync} from 'node:fs';
 import {createHash} from 'node:crypto';
 import {describe,it,expect} from 'vitest';
 import {memoryRawStore} from '../../dq/raw-store';
-import {createPacer} from '../../facts/providers/shared';
+import {budgetFor,createPacer} from '../../facts/providers/shared';
+import {fetchCompanyFacts} from '../../facts/providers/edgar-companyfacts';
 import {sanitizeProvenance} from '../provenance';
 import {
  SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
@@ -61,6 +62,8 @@ describe('parseSubmissions',()=>{
   expect(code({...doc,tickers:[1]})).toBe('invalid_schema');
   expect(code({...doc,filings:{recent:doc.filings.recent}})).toBe('invalid_schema');
   expect(code({...doc,filings:{...doc.filings,files:{}}})).toBe('invalid_schema');
+  const blank=parseSubmissions(JSON.stringify({...doc,tickers:['',' zzfx ']}));
+  expect(blank).toMatchObject({tickers:['ZZFX'],tickerPositions:[1]});
   expect(code({...doc,tickers:[],filings:{...doc.filings,files:[]}})).toBeNull();
   expect(parseSubmissions(JSON.stringify({...doc,tickers:[],filings:{...doc.filings,files:[]}}))).toMatchObject({tickers:[],files:[]});
  });
@@ -105,6 +108,11 @@ describe('submissionsClient',()=>{
   const f=harness({[MAIN_URL]:()=>new Response('nope',{status:503})});
   await expect(fetchSubmissions('999001',f.deps)).rejects.toMatchObject({code:'sec_unavailable'});
   expect(f.raw.objects.size).toBe(2);
+  const err=await fetchSubmissions('999001',{...f.deps,pacer:createPacer(SEC_MIN_INTERVAL_MS)}).catch((e:unknown)=>e) as SecSubmissionsError;
+  expect(err.raw).toEqual({sha256:sha('nope'),path:expect.stringMatching(/^sec-submissions\/[0-9a-f]{64}\.json$/)});
+  expect([...f.raw.objects.keys()]).toContain(err.raw!.path);
+  const bad=await fetchSubmissions('999001',harness({[MAIN_URL]:json('{"cik":"0000999001"}')}).deps).catch((e:unknown)=>e) as SecSubmissionsError;
+  expect(bad).toMatchObject({code:'invalid_schema',raw:{sha256:sha('{"cik":"0000999001"}')}});
   expect(JSON.parse(new TextDecoder().decode([...f.raw.objects].find(([p])=>p.endsWith('.meta.json'))![1]))).toMatchObject({http_status:503});
  });
  it('starts no request and no upload once the budget is aborted',async()=>{
@@ -124,6 +132,15 @@ describe('submissionsClient',()=>{
   expect(stamps).toHaveLength(4);
   for(let i=1;i<stamps.length;i++)expect(stamps[i]-stamps[i-1]).toBeGreaterThanOrEqual(SEC_MIN_INTERVAL_MS-5);
  });
+ it('shares one SEC pacer with companyfacts: a companyfacts call and a submissions call are >= 120 ms apart',async()=>{
+  const stamps:number[]=[];
+  const f=(async()=>{stamps.push(Date.now());return new Response(MAIN,{status:200});}) as typeof globalThis.fetch;
+  await fetchCompanyFacts('0000999001',budgetFor(60_000),{fetch:f});
+  await fetchSubmissions('999001',{fetch:f,raw:memoryRawStore()});
+  await fetchCompanyFacts('0000999001',budgetFor(60_000),{fetch:f});
+  expect(stamps).toHaveLength(3);
+  for(let i=1;i<3;i++)expect(stamps[i]-stamps[i-1]).toBeGreaterThanOrEqual(SEC_MIN_INTERVAL_MS-5);
+ });
  it('maps HTTP errors and network failures to sec_unavailable and a CIK mismatch to invalid_schema',async()=>{
   const code=async(p:Promise<unknown>)=>p.then(()=>null,(e:unknown)=>e instanceof SecSubmissionsError?e.code:'other');
   expect(await code(fetchSubmissions('999001',harness({[MAIN_URL]:()=>new Response('nope',{status:404})}).deps))).toBe('sec_unavailable');
@@ -145,7 +162,7 @@ describe('submissionsEvidenceClaims',()=>{
   expect(claims[1].detail.params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
   expect(claims[1].detail.evidence.evidence_sha256).toBe(sha(PAGE));
   expect(claims[1].detail.evidence.locator).toBe('CIK0000999001-submissions-001.json#accessionNumber=0000999001-01-000001');
-  // locators and evidence must pass the public-provenance guards (no '?', '#', key=/token: text)
+  // locators and evidence must pass the public-provenance guards (no '?' query, no key=/token: text; the plan's '#accessionNumber=' form is verified to pass them)
   for(const c of claims)expect(()=>sanitizeProvenance({valid_from:c.detail.evidence},['valid_from'])).not.toThrow();
  });
 });
diff --git a/src/lib/entities/identifiers/sec-submissions.ts b/src/lib/entities/identifiers/sec-submissions.ts
index c0a7d65..f904d72 100644
--- a/src/lib/entities/identifiers/sec-submissions.ts
+++ b/src/lib/entities/identifiers/sec-submissions.ts
@@ -8,7 +8,7 @@
 // never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
 import type {Budget} from '../../facts/types';
 import type {Pacer} from '../../facts/providers/shared';
-import {PacerError,createPacer} from '../../facts/providers/shared';
+import {PacerError,SEC_MIN_INTERVAL_MS as SHARED_INTERVAL,secPacer} from '../../facts/providers/shared';
 import type {RawStore} from '../../dq/raw-store';
 import {normalizeCik} from '../../research/entity-keys/identifiers';
 import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
@@ -16,7 +16,7 @@ import type {ClaimInput} from '../claims';
 import type {ClaimEvidence} from '../types';
 
 export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
-export const SEC_MIN_INTERVAL_MS=120;
+export const SEC_MIN_INTERVAL_MS=SHARED_INTERVAL;
 export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
 const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
 export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;
@@ -24,11 +24,11 @@ export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalize
 export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
 export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
 export interface FormerName{name:string;from:string|null;to:string|null}
-export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
+export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
 export interface StoredDoc{name:string;sha256:string;path:string}
 export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
 export class SecSubmissionsError extends Error{
- constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
+ constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string,readonly raw?:{sha256:string;path:string}){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
 }
 export type FilerAcceleration='large_accelerated'|'accelerated'|'non_accelerated'|'unknown';
 
@@ -79,12 +79,17 @@ export function parseSubmissions(json:string):ParsedSubmissions{
  // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
  const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
  const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
+ const tickerList=(v:unknown)=>{
+  const all=requiredStrings(v,'tickers').map(t=>t.trim().toUpperCase());
+  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
+  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
+ };
  const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
  const fye=text(d.fiscalYearEnd);
  return {
   cik,name:text(d.name),category:text(d.category),
   fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
-  tickers:requiredStrings(d.tickers,'tickers').map(t=>t.trim().toUpperCase()).filter(t=>t!==''),exchanges:strings(d.exchanges),
+  ...tickerList(d.tickers),exchanges:strings(d.exchanges),
   formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
    const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
    return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
@@ -102,8 +107,16 @@ export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?
  /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}
 
 const FETCH_TIMEOUT_MS=30_000;
-// Process-wide: SEC's limit is per source address, so all callers share one serialised pacer (>= 120 ms between requests).
-const SEC_PACER:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
+/** Runs a parse of stored bytes; a schema failure carries the stored document's sha256/path so the evidence can be found. */
+function parseStored<T>(doc:StoredDoc,parse:()=>T):T{
+ try{return parse();}
+ catch(e){
+  if(e instanceof SecSubmissionsError&&!e.raw)throw new SecSubmissionsError(e.code,e.message.replace(/^[a-z_]+: ?/,''),{sha256:doc.sha256,path:doc.path});
+  throw e;
+ }
+}
+// Process-wide: SEC's limit is per source address, so every SEC caller (also companyfacts) shares secPacer.
+const SEC_PACER:Pacer=secPacer;
 const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});
 
 export function submissionsClient(deps:FetchSubmissionsDeps){
@@ -127,10 +140,11 @@ export function submissionsClient(deps:FetchSubmissionsDeps){
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: ${e instanceof Error?e.message:String(e)}`);}
   const contentType=(res.headers.get('content-type')??'').includes('html')?'text/html' as const:'application/json' as const;
   if(!res.ok){
-   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported.
-   try{await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
+   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported with its sha256/path.
+   let stored:{sha256:string;path:string};
+   try{stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
    catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
-   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`);
+   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`,{sha256:stored.sha256,path:stored.path});
   }
   const stored=await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);
   return {bytes,doc:{name,sha256:stored.sha256,path:stored.path}};
@@ -141,8 +155,7 @@ export function submissionsClient(deps:FetchSubmissionsDeps){
    const c=normalizeCik(cik);
    const fetchedAt=clock().toISOString();
    const main=await get(submissionsUrl(c),c,'main');
-   const parsed=parseSubmissions(new TextDecoder().decode(main.bytes));
-   if(parsed.cik!==c)throw invalid(`cik ${parsed.cik} != ${c}`);
+   const parsed=parseStored(main.doc,()=>{const x=parseSubmissions(new TextDecoder().decode(main.bytes));if(x.cik!==c)throw invalid(`cik ${x.cik} != ${c}`);return x;});
    const from=opts.coverFrom??null;
    const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
    const pages:StoredDoc[]=[];
@@ -151,7 +164,7 @@ export function submissionsClient(deps:FetchSubmissionsDeps){
    for(const f of wanted){
     const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
     pages.push(p.doc);
-    for(const x of parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
+    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
    }
    return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
   },
diff --git a/src/lib/entities/submissions-evidence.test.ts b/src/lib/entities/submissions-evidence.test.ts
index 7736261..bc70899 100644
--- a/src/lib/entities/submissions-evidence.test.ts
+++ b/src/lib/entities/submissions-evidence.test.ts
@@ -44,4 +44,16 @@ describe('applySubmissionsEvidence',()=>{
   const none=await applySubmissionsEvidence(client(),{issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF'])});
   expect(none.skippedSummary).toEqual({ticker_not_in_universe:1});
  });
+ it('indexes the conflict locator in the RAW tickers array and labels an own-row conflict window_conflict',async()=>{
+  const blankFirst=(async(u:string|URL|Request)=>new Response(String(u).endsWith('-001.json')?PAGE:JSON.stringify({...JSON.parse(MAIN),tickers:['','ZZFX']}),{status:200})) as typeof globalThis.fetch;
+  const snap=await fetchSubmissions('999001',{fetch:blankFirst,raw:memoryRawStore(),sleep:async()=>{}},{coverFrom:'1993-01-01'});
+  const c=client();
+  await c.insert('issuer_securities',sec(OTHER,'ZZFX'));
+  await applySubmissionsEvidence(c,{issuerId:ISSUER,primaryTicker:null,snapshot:snap,asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZFX'])});
+  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({reason_code:'ownership_conflict',detail:expect.objectContaining({locator:'tickers[1]'})})]);
+  const own=client();
+  await own.insert('issuer_securities',sec(ISSUER,'ZZFX',{valid_from:'2026-11-05',valid_to:'2026-12-01',valid_to_method:'curated'}));
+  await applySubmissionsEvidence(own,{issuerId:ISSUER,primaryTicker:null,snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZFX'])});
+  expect(own.rows('dq_quarantine')).toEqual([expect.objectContaining({reason_code:'window_conflict',detail:expect.objectContaining({reason:'own_window_conflict'})})]);
+ });
 });
diff --git a/src/lib/entities/submissions-evidence.ts b/src/lib/entities/submissions-evidence.ts
index 72276fe..bc358d1 100644
--- a/src/lib/entities/submissions-evidence.ts
+++ b/src/lib/entities/submissions-evidence.ts
@@ -32,7 +32,8 @@ export async function applySubmissionsEvidence(tables:TableClient,input:Submissi
   catch(e){counts.failed++;errors.push({code:'claim_error',key:c.value,message:errorMessage(e)});}
  }
  const held=new Set((await tables.select('issuer_securities',{issuer_id:input.issuerId,valid_to:null})).map(r=>String(r.ticker)));
- for(const [at,raw] of input.snapshot.parsed.tickers.entries()){
+ for(const [n,raw] of input.snapshot.parsed.tickers.entries()){
+  const at=input.snapshot.parsed.tickerPositions[n];   // position in the raw document
   const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
   if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
   if(held.has(ticker)){counts.duplicates++;continue;}
@@ -40,9 +41,14 @@ export async function applySubmissionsEvidence(tables:TableClient,input:Submissi
    const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{valid_from:{source:'sec_submissions',as_of:input.asOf,evidence_sha256:input.snapshot.main.sha256}}});
    if(res==='inserted')counts.inserted++;
    else if(res==='duplicate')counts.duplicates++;
-   else await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode:'ownership_conflict',
-    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions',sec_ticker:raw,locator:`tickers[${at}]`,fetched_at:input.snapshot.fetchedAt,evidence_sha256:input.snapshot.main.sha256,raw_path:input.snapshot.main.path},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
-    counts,errors,{code:'ownership_conflict',key:ticker});
+   else{
+    // Another issuer holds the ticker: ownership_conflict. Only this issuer's own rows in the way: window_conflict.
+    const other=(await tables.select('issuer_securities',{ticker})).some(r=>String(r.issuer_id)!==input.issuerId);
+    const reasonCode=other?'ownership_conflict':'window_conflict';
+    await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode,
+    detail:{reason:other?'ticker_owned_by_other_issuer':'own_window_conflict',source:'sec_submissions',sec_ticker:raw,locator:`tickers[${at}]`,fetched_at:input.snapshot.fetchedAt,evidence_sha256:input.snapshot.main.sha256,raw_path:input.snapshot.main.path},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
+    counts,errors,{code:reasonCode,key:ticker});
+   }
   }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
  }
  counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
diff --git a/src/lib/facts/providers/edgar-companyfacts.ts b/src/lib/facts/providers/edgar-companyfacts.ts
index de7c477..8b63ec2 100644
--- a/src/lib/facts/providers/edgar-companyfacts.ts
+++ b/src/lib/facts/providers/edgar-companyfacts.ts
@@ -21,16 +21,16 @@ import type {NumberSchema} from '../json-numbers';
 import {normalizeUnit,unitKindOf} from '../units';
 import {classifyDuration,daysBetween as daysBetweenOrNull,isDate} from '../classify';
 import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
-import {createPacer,nearestDuration,PacerError,ProviderError,rawHashOf,sleep,snapshotOf} from './shared';
+import {nearestDuration,PacerError,ProviderError,rawHashOf,SEC_MIN_INTERVAL_MS,secPacer,sleep,snapshotOf} from './shared';
 
 export const companyFactsUrl=(cik10:string)=>`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
 export const MAX_SNAPSHOT_BYTES=50*1024*1024;
-export const SEC_MIN_INTERVAL_MS=120;
+export {SEC_MIN_INTERVAL_MS};
 /** Same schema as json-numbers.ts: cik/fy control integers, val decimal text. */
 export const COMPANYFACTS_SCHEMA:NumberSchema=EDGAR_NUMBER_SCHEMA;
 const BACKOFF_MS=[1000,2000,4000,8000];
 const RESERVE_MS=20_000;
-const pacer=createPacer(SEC_MIN_INTERVAL_MS);   // module-level: one pace across every issuer and every concurrent caller of this process
+const pacer=secPacer;   // process-wide (shared with SEC submissions): one pace across every SEC caller
 /** Test hook: forget the pacing state (tests use fake clocks). */
 export const resetSecPacing=()=>pacer.reset();
 
diff --git a/src/lib/facts/providers/shared.ts b/src/lib/facts/providers/shared.ts
index 5613814..4fe9dbd 100644
--- a/src/lib/facts/providers/shared.ts
+++ b/src/lib/facts/providers/shared.ts
@@ -74,6 +74,9 @@ export function createPacer(defaultIntervalMs:number):Pacer{
   reset(){chain=Promise.resolve();lastStart=-Infinity;},
  };
 }
+/** SEC fair-access spacing and THE process-wide SEC pacer: every SEC caller (companyfacts, submissions, ...) admits through it. */
+export const SEC_MIN_INTERVAL_MS=120;
+export const secPacer:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
 export function budgetFor(ms:number,parent?:AbortSignal):Budget{
  const until=Date.now()+ms;const ctl=new AbortController();
  parent?.addEventListener('abort',()=>ctl.abort(parent.reason),{once:true});

exec
/bin/zsh -lc "cat src/lib/facts/providers/shared.ts | head -110; cat src/lib/entities/securities.ts; cat scripts/entity-keys/sec-submissions.ts; find . -name '*AGENTS*' -not -path './node_modules/*'; find . -name CLAUDE.md -not -path './node_modules/*'; cat src/lib/entities/identifiers/sec-submissions.ts | head -175" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 188ms:
// src/lib/facts/providers/shared.ts
// Provider plumbing shared by the EDGAR and Tushare adapters (spec §6.2/§6.3; §4.7 raw_hash rule):
// typed provider failures (ProviderError IS SyncError from ../errors, so sync.ts reads `code` as the
// batch error code without re-wrapping), snapshot construction with sha256, the raw_hash locator rule
// sha256(snapshot.sha256 + "\n" + locator), and a number-preserving JSON serialiser used by the
// fixture recorder (never JSON.parse → stringify a financial value).
import {createHash} from 'node:crypto';
import {SyncError} from '../errors';
import type {SyncErrorCode} from '../errors';
import type {Budget,Duration,RawSnapshot} from '../types';

export type ProviderErrorCode=SyncErrorCode;
export const ProviderError=SyncError;
export type ProviderError=SyncError;

export const sha256Hex=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
export const rawHashOf=(snapshotSha256:string,locator:string)=>sha256Hex(`${snapshotSha256}\n${locator}`);
export function snapshotOf(bytes:Uint8Array,meta:Partial<RawSnapshot['meta']>&{source:RawSnapshot['meta']['source']}):RawSnapshot{
 return {bytes,sha256:sha256Hex(bytes),meta:{fetched_at:new Date().toISOString(),http_status:200,...meta}};
}
export const padCik=(cik:string|number)=>String(cik).replace(/^0+/,'').padStart(10,'0');
export const ymd=(d:string)=>/^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:d;
const BUCKETS:[number,Duration][]=[[90,'3M'],[182,'6M'],[273,'9M'],[365,'12M']];
/** Closest duration bucket for an odd period length; only used to type oddDuration candidates (never written as facts). */
export const nearestDuration=(days:number):Duration=>BUCKETS.reduce((best,cur)=>Math.abs(cur[0]-days)<Math.abs(best[0]-days)?cur:best)[1];
export function sleep(ms:number,signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(signal.reason);
  const onAbort=()=>{clearTimeout(t);reject(signal.reason);};
  const t=setTimeout(()=>{signal.removeEventListener('abort',onAbort);resolve();},ms);
  signal.addEventListener('abort',onAbort,{once:true});
 });
}
/** Thrown by Pacer.admit; the message is the fixed code. Adapters map it to their own ProviderError code. */
export class PacerError extends Error{constructor(public readonly code:'budget_aborted'|'budget_exhausted'){super(code);this.name='PacerError';}}
export interface AdmitOptions{budget:Budget;reserveMs:number;now?:()=>number;sleep?:typeof sleep;minIntervalMs?:number}
export interface Pacer{admit(o:AdmitOptions):Promise<void>;reset():void}
/**
 * One process-wide request pacer per upstream. Admissions are SERIALISED (a promise chain), and each wait is computed from the
 * previous ACTUAL dispatch time recorded when admit() resolves, so a timer delayed by the event loop can never let two requests
 * start closer than the interval. A wait that would end inside the cleanup reserve (remaining - wait <= reserveMs) is rejected
 * up front with budget_exhausted instead of sleeping; an aborted budget gives budget_aborted (a queued caller is released as soon
 * as its own signal aborts, and its entry is skipped when its turn comes). The caller issues its request
 * right after admit() resolves.
 */
export function createPacer(defaultIntervalMs:number):Pacer{
 let chain:Promise<void>=Promise.resolve();let lastStart=-Infinity;
 const run=async(o:AdmitOptions)=>{
  const now=o.now??Date.now,wait=o.sleep??sleep,interval=o.minIntervalMs??defaultIntervalMs;
  const check=()=>{if(o.budget.signal.aborted)throw new PacerError('budget_aborted');if(o.budget.remainingMs()<=o.reserveMs)throw new PacerError('budget_exhausted');};
  check();
  const gap=lastStart+interval-now();
  if(gap>0){
   if(o.budget.remainingMs()-gap<=o.reserveMs)throw new PacerError('budget_exhausted');
   try{await wait(gap,o.budget.signal);}catch{throw new PacerError('budget_aborted');}
   check();                                  // the budget may have run out or been cancelled while waiting
  }
  lastStart=now();
 };
 return {
  admit(o){
   // The internal chain keeps serialising; the caller-facing promise also races its OWN signal, so an aborted caller is released
   // at once instead of waiting behind earlier admissions. When its turn comes the cancelled entry is skipped by run()'s first
   // check (no dispatch, lastStart unchanged).
   const p=chain.then(()=>run(o));chain=p.catch(()=>undefined);
   const signal=o.budget.signal;
   if(signal.aborted)return Promise.reject(new PacerError('budget_aborted'));
   return new Promise<void>((resolve,reject)=>{
    const onAbort=()=>reject(new PacerError('budget_aborted'));
    signal.addEventListener('abort',onAbort,{once:true});
    p.then(resolve,reject).finally(()=>signal.removeEventListener('abort',onAbort));
   });
  },
  reset(){chain=Promise.resolve();lastStart=-Infinity;},
 };
}
/** SEC fair-access spacing and THE process-wide SEC pacer: every SEC caller (companyfacts, submissions, ...) admits through it. */
export const SEC_MIN_INTERVAL_MS=120;
export const secPacer:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
export function budgetFor(ms:number,parent?:AbortSignal):Budget{
 const until=Date.now()+ms;const ctl=new AbortController();
 parent?.addEventListener('abort',()=>ctl.abort(parent.reason),{once:true});
 return {remainingMs:()=>until-Date.now(),signal:ctl.signal};
}
/** JSON text of a scanJsonNumbers() tree with every {__num:'<literal>'} written back as the literal. */
export function stringifyPreservingNumbers(value:unknown,indent?:number):string{
 const text=JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&typeof (v as {__num?:unknown}).__num==='string'?`\u0000${(v as {__num:string}).__num}\u0000`:v,indent);
 return text.replace(/"\\u0000(-?[0-9.eE+]+)\\u0000"/g,'$1');
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
/**
 * SEC submissions identity evidence (spec §4.3.3) for US in-scope issuers with a CIK: fetches
 * submissions (all filings.files[] pages), stores the raw bytes, and writes formerNames aliases,
 * 8-A/25 evidence_only claims and SEC-listed tickers (first_observed).
 *   npx tsx scripts/entity-keys/sec-submissions.ts [--issuer <uuid>]... [--apply]
 * Dry run (default): fetches and prints what would be written (raw bytes hashed in memory only).
 * --apply records an ingest batch (dataset entities.sec-submissions) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; EDGAR_USER_AGENT (else DEFAULT_USER_AGENT).
 */
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchCounts,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import {SUBMISSIONS_PARSER_VERSION,SecSubmissionsError,submissionsClient,submissionsEvidenceClaims} from '../../src/lib/entities/identifiers/sec-submissions';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {applySubmissionsEvidence} from '../../src/lib/entities/submissions-evidence';
import {normalizeSecurityTicker} from '../../src/lib/securities/ticker';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.submissions;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_PAGES='1993-01-01';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const add=(a:BatchCounts,b:BatchCounts)=>{for(const k of Object.keys(a) as (keyof BatchCounts)[])a[k]+=b[k];};

async function main(){
 const argv=process.argv.slice(2);
 const ids:string[]=[];let apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--issuer'&&UUID.test(argv[i+1]??''))ids.push(argv[++i].toLowerCase());
  else{console.error('usage: sec-submissions.ts [--issuer <uuid>]... [--apply]');process.exit(2);}
 }
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const inScope=new Set((await selectAll(tables,'fact_sync_scope',{market:'US'},'issuer_id')).filter(s=>typeof s.priority==='number'&&s.priority>0).map(s=>String(s.issuer_id)));
 const issuers=(await selectAll(tables,'issuers',{status:'active'},'issuer_id'))
  .filter(i=>typeof i.cik==='string'&&inScope.has(String(i.issuer_id))&&(ids.length===0||ids.includes(String(i.issuer_id))));
 const universe=new Set((await selectAll(tables,'stocks_universe',{market:'US'},'ticker')).map(r=>String(r.ticker)));
 const raw=apply?supabaseRawStore(admin):memoryRawStore();
 const client=submissionsClient({fetch,raw});
 const batchId=apply?(await startBatch(tables,{producer:'sec-submissions',dataset:DATASET,toolVersions:{parser:SUBMISSIONS_PARSER_VERSION,as_of:asOf}})).batchId:null;
 const counts=emptyCounts();let errors:BatchError[]=[];let status:BatchStatus='failed';
 const preview:Record<string,unknown>[]=[];
 try{
  for(const i of issuers){
   const issuerId=String(i.issuer_id),cik=String(i.cik);
   try{
    const snapshot=await client.fetch(cik,{coverFrom:ALL_PAGES});
    const open=await tables.select('issuer_securities',{issuer_id:issuerId,valid_to:null},{orderBy:'ticker'});
    // aliases attach to the issuer's primary row only; with no is_primary row there is no primary (apply then skips the names)
    const primary=open.find(r=>r.is_primary===true);
    const primaryTicker=primary?String(primary.ticker):null;
    if(!batchId){
     // the preview fetches every page too (coverFrom=ALL_PAGES) but writes nothing
     const normalized=snapshot.parsed.tickers.map(t=>universe.has(t)?t:normalizeSecurityTicker(t,'US'));
     preview.push({cik,formerNames:snapshot.parsed.formerNames.length,evidenceClaims:submissionsEvidenceClaims(issuerId,snapshot,asOf).length,
      secOnlyTickers:normalized.filter((t):t is string=>t!==null&&universe.has(t)&&!open.some(r=>r.ticker===t)),pages:snapshot.pages.length,complete:snapshot.complete});
     continue;
    }
    const res=await applySubmissionsEvidence(tables,{issuerId,primaryTicker,snapshot,asOf,batchId,dataset:DATASET,universe});
    add(counts,res.counts);errors=[...errors,...res.errors];
   }catch(e){
    counts.failed++;
    const raw=e instanceof SecSubmissionsError&&e.raw?` [raw sha256=${e.raw.sha256} path=${e.raw.path}]`:'';
    errors.push({code:e instanceof SecSubmissionsError?e.code:'exception',key:cik,message:errorMessage(e)+raw});
   }
  }
 }finally{
  if(batchId){
   try{status=await finishBatch(tables,batchId,{counts,errors});}
   catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
  }
 }
 if(!batchId){console.log(JSON.stringify({mode:'dry-run (nothing written; pass --apply)',issuers:issuers.length,preview,errors},null,1));return;}
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});
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

exec
/bin/zsh -lc "rg 'ParsedSubmissions|SubmissionsSnapshot|tickerPositions' src scripts; cat src/lib/dq/batches.ts | head -180; cat src/lib/entities/submissions-evidence.ts; cat package.json | grep -A20 scripts; for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls \""'$d"/AGENTS* 2>/dev/null; done; ls /Users/osborn/.codex/config*' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
src/lib/entities/submissions-evidence.ts:import {submissionsEvidenceClaims,type SubmissionsSnapshot} from './identifiers/sec-submissions';
src/lib/entities/submissions-evidence.ts:export interface SubmissionsApplyInput{issuerId:string;primaryTicker:string|null;snapshot:SubmissionsSnapshot;asOf:string;batchId:string;dataset:string;universe:ReadonlySet<string>}
src/lib/entities/submissions-evidence.ts:  const at=input.snapshot.parsed.tickerPositions[n];   // position in the raw document
src/lib/entities/identifiers/sec-submissions.test.ts:  expect(blank).toMatchObject({tickers:['ZZFX'],tickerPositions:[1]});
src/lib/entities/identifiers/sec-submissions.ts:export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];/** index of each tickers[] entry in the raw document (blank entries are dropped, positions kept) */tickerPositions:number[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
src/lib/entities/identifiers/sec-submissions.ts:export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
src/lib/entities/identifiers/sec-submissions.ts:export function parseSubmissions(json:string):ParsedSubmissions{
src/lib/entities/identifiers/sec-submissions.ts:  const tickerPositions=all.flatMap((t,i)=>t===''?[]:[i]);
src/lib/entities/identifiers/sec-submissions.ts:  return {tickers:tickerPositions.map(i=>all[i]),tickerPositions};
src/lib/entities/identifiers/sec-submissions.ts:  async fetch(cik:string,opts:{coverFrom?:string|null}={}):Promise<SubmissionsSnapshot>{
src/lib/entities/identifiers/sec-submissions.ts:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
src/lib/entities/identifiers/sec-submissions.ts:export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapshot,asOf:string):ClaimInput[]{
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
// src/lib/entities/submissions-evidence.ts
// Writes the identity evidence of one SEC submissions snapshot (spec §4.3.3): formerNames as
// security_aliases on the issuer's primary row, 8-A/25 filings as evidence_only claims, and
// tickers[] that SEC lists but this database does not hold as first_observed rows (only tickers in
// stocks_universe; a ticker held by another issuer is quarantined as ownership_conflict). Tickers
// this database holds but SEC no longer lists are handled by load-sec ticker-change detection.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {normalizeSecurityTicker} from '../securities/ticker';
import {fileClaim,isUnique} from './claims';
import {submissionsEvidenceClaims,type SubmissionsSnapshot} from './identifiers/sec-submissions';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {attachSecurity} from './securities';

export interface SubmissionsApplyInput{issuerId:string;primaryTicker:string|null;snapshot:SubmissionsSnapshot;asOf:string;batchId:string;dataset:string;universe:ReadonlySet<string>}

export async function applySubmissionsEvidence(tables:TableClient,input:SubmissionsApplyInput):Promise<ApplyResult&{claims:Record<string,number>}>{
 const counts=emptyCounts();const errors:BatchError[]=[];
 const skippedSummary:Record<string,number>={};const claims:Record<string,number>={};
 const skip=(k:string)=>{skippedSummary[k]=(skippedSummary[k]??0)+1;};
 const names=input.snapshot.parsed.formerNames;
 if(input.primaryTicker){
  for(const f of names){
   try{
    await tables.insert('security_aliases',{alias:f.name,ticker:input.primaryTicker,alias_type:'name',source:'sec_submissions',created_at:new Date().toISOString()});
    counts.inserted++;
   }catch(e){if(isUnique(e))counts.duplicates++;else{counts.failed++;errors.push({code:'alias_error',key:f.name,message:errorMessage(e)});}}
  }
 }else if(names.length)skip('no_primary_ticker');
 for(const c of submissionsEvidenceClaims(input.issuerId,input.snapshot,input.asOf)){
  try{const created=await fileClaim(tables,c);const k=created?'evidence_only':'evidence_only_appended';claims[k]=(claims[k]??0)+1;}
  catch(e){counts.failed++;errors.push({code:'claim_error',key:c.value,message:errorMessage(e)});}
 }
 const held=new Set((await tables.select('issuer_securities',{issuer_id:input.issuerId,valid_to:null})).map(r=>String(r.ticker)));
 for(const [n,raw] of input.snapshot.parsed.tickers.entries()){
  const at=input.snapshot.parsed.tickerPositions[n];   // position in the raw document
  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
  if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
  if(held.has(ticker)){counts.duplicates++;continue;}
  try{
   const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{valid_from:{source:'sec_submissions',as_of:input.asOf,evidence_sha256:input.snapshot.main.sha256}}});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else{
    // Another issuer holds the ticker: ownership_conflict. Only this issuer's own rows in the way: window_conflict.
    const other=(await tables.select('issuer_securities',{ticker})).some(r=>String(r.issuer_id)!==input.issuerId);
    const reasonCode=other?'ownership_conflict':'window_conflict';
    await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode,
    detail:{reason:other?'ticker_owned_by_other_issuer':'own_window_conflict',source:'sec_submissions',sec_ticker:raw,locator:`tickers[${at}]`,fetched_at:input.snapshot.fetchedAt,evidence_sha256:input.snapshot.main.sha256,raw_path:input.snapshot.main.path},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
    counts,errors,{code:reasonCode,key:ticker});
   }
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
}
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
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
/Users/osborn/.codex/config.toml

exec
/bin/zsh -lc "rg 'fallback|project_doc' /Users/osborn/.codex/config.toml; node node_modules/vitest/vitest.mjs run src/lib/entities/identifiers/sec-submissions.test.ts src/lib/entities/submissions-evidence.test.ts src/lib/facts/providers/edgar-companyfacts.test.ts --cache=false" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 284ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/entities/identifiers/sec-submissions.test.ts (0 test)
 ❯ src/lib/entities/submissions-evidence.test.ts (0 test)
 ❯ src/lib/facts/providers/edgar-companyfacts.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/entities/submissions-evidence.test.ts [ src/lib/entities/submissions-evidence.test.ts ]
 FAIL  src/lib/entities/identifiers/sec-submissions.test.ts [ src/lib/entities/identifiers/sec-submissions.test.ts ]
 FAIL  src/lib/facts/providers/edgar-companyfacts.test.ts [ src/lib/facts/providers/edgar-companyfacts.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/ddMP-zEK0BrVayTRFpnq9/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯


 Test Files  3 failed (3)
      Tests  no tests
   Start at  01:13:57
   Duration  161ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions introduced by this commit were identified. Targeted tests could not execute because the read-only sandbox prevented Vitest from creating temporary directories.
No actionable regressions introduced by this commit were identified. Targeted tests could not execute because the read-only sandbox prevented Vitest from creating temporary directories.

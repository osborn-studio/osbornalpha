OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b01f-53ce-7071-9359-d528c8578d1f
--------
user
commit 1305fb8
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1305fb8; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 252ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-Unis9Plb' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-5oyM2et1' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-k1jcomGf' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iSRAMPwE' (errno=Operation not permitted)
1305fb8 fix(entities): submissions review round 1 (plan locators, strict tickers/files, shared SEC pacer, conflict evidence)
 .../entities/identifiers/sec-submissions.test.ts   | 31 +++++++++++++++++++---
 src/lib/entities/identifiers/sec-submissions.ts    | 21 ++++++++++-----
 src/lib/entities/submissions-evidence.test.ts      |  5 +++-
 src/lib/entities/submissions-evidence.ts           |  4 +--
 4 files changed, 47 insertions(+), 14 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in . .. ../.. ../../.. ../../../..; do ls "$p"/AGENTS* "$p"/CLAUDE.md 2>/dev/null; done; git show 1305fb8; cat src/lib/entities/identifiers/sec-submissions.ts; cat src/lib/entities/submissions-evidence.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZGmEa4UZ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-GQ1ybhxF' (errno=Operation not permitted)
commit 1305fb8aa0d68a341d5747a9d76fb0d2b004fed5
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:09:54 2026 -0800

    fix(entities): submissions review round 1 (plan locators, strict tickers/files, shared SEC pacer, conflict evidence)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers/sec-submissions.test.ts b/src/lib/entities/identifiers/sec-submissions.test.ts
index 7eece2e..d4ed6c8 100644
--- a/src/lib/entities/identifiers/sec-submissions.test.ts
+++ b/src/lib/entities/identifiers/sec-submissions.test.ts
@@ -3,6 +3,7 @@ import {readFileSync} from 'node:fs';
 import {createHash} from 'node:crypto';
 import {describe,it,expect} from 'vitest';
 import {memoryRawStore} from '../../dq/raw-store';
+import {createPacer} from '../../facts/providers/shared';
 import {sanitizeProvenance} from '../provenance';
 import {
  SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
@@ -20,7 +21,7 @@ function harness(map:Record<string,()=>Response>){
  const calls:{url:string;init:RequestInit}[]=[];const sleeps:number[]=[];let t=0;
  const fetch=(async(u:string|URL|Request,init?:RequestInit)=>{const url=String(u);calls.push({url,init:init??{}});const r=map[url];if(!r)throw new TypeError(`fetch failed: ${url}`);return r();}) as typeof globalThis.fetch;
  const raw=memoryRawStore();
- return {calls,sleeps,raw,deps:{fetch,raw,userAgent:'ZZ test ua@example.com',now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;},clock:()=>new Date('2026-11-05T08:00:00Z')}};
+ return {calls,sleeps,raw,deps:{fetch,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),userAgent:'ZZ test ua@example.com',now:()=>t,sleep:async(ms:number)=>{sleeps.push(ms);t+=ms;},clock:()=>new Date('2026-11-05T08:00:00Z')}};
 }
 const json=(s:string)=>()=>new Response(s,{status:200,headers:{'content-type':'application/json'}});
 const MAIN_URL='https://data.sec.gov/submissions/CIK0000999001.json';
@@ -38,7 +39,7 @@ describe('parseSubmissions',()=>{
  it('maps empty strings to null, 0/1 to booleans, and lists pages',()=>{
   const p=parseSubmissions(MAIN);
   expect(p.fiscalYearEnd).toBe('0630');
-  expect(p.filings[1]).toEqual({accessionNumber:'0000999001-25-000031',filingDate:'2025-09-12',reportDate:null,acceptanceDateTime:'2025-09-12T09:00:00.000Z',form:'25-NSE',primaryDocument:'xslF25X02/primary_doc.xml',isInlineXBRL:false,page:'recent',index:1});
+  expect(p.filings[1]).toEqual({accessionNumber:'0000999001-25-000031',filingDate:'2025-09-12',reportDate:null,acceptanceDateTime:'2025-09-12T09:00:00.000Z',form:'25-NSE',primaryDocument:'xslF25X02/primary_doc.xml',isInlineXBRL:false,page:'recent'});
   expect(p.files).toEqual([{name:'CIK0000999001-submissions-001.json',filingCount:2,filingFrom:'2001-02-03',filingTo:'2014-12-31'}]);
   expect(parseSubmissionsPage(PAGE,'CIK0000999001-submissions-001.json').map(f=>[f.form,f.page])).toEqual([['10-Q','CIK0000999001-submissions-001.json'],['8-A12B','CIK0000999001-submissions-001.json']]);
  });
@@ -51,6 +52,18 @@ describe('parseSubmissions',()=>{
   expect(submissionsCategory('Smaller reporting company')).toBe('unknown');
   expect(submissionsCategory('')).toBe('unknown');expect(submissionsCategory(null)).toBe('unknown');
  });
+ it('separates absent or malformed tickers/files (invalid_schema) from valid empty lists',()=>{
+  const doc=JSON.parse(MAIN);
+  const code=(d:unknown)=>{try{parseSubmissions(JSON.stringify(d));return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
+  const {tickers:_t,...noTickers}=doc;void _t;
+  expect(code(noTickers)).toBe('invalid_schema');
+  expect(code({...doc,tickers:'ZZFX'})).toBe('invalid_schema');
+  expect(code({...doc,tickers:[1]})).toBe('invalid_schema');
+  expect(code({...doc,filings:{recent:doc.filings.recent}})).toBe('invalid_schema');
+  expect(code({...doc,filings:{...doc.filings,files:{}}})).toBe('invalid_schema');
+  expect(code({...doc,tickers:[],filings:{...doc.filings,files:[]}})).toBeNull();
+  expect(parseSubmissions(JSON.stringify({...doc,tickers:[],filings:{...doc.filings,files:[]}}))).toMatchObject({tickers:[],files:[]});
+ });
  it('rejects malformed documents with invalid_schema',()=>{
   const bad=(s:string)=>{try{parseSubmissions(s);return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
   expect(bad('{')).toBe('invalid_schema');
@@ -101,6 +114,16 @@ describe('submissionsClient',()=>{
   await expect(fetchSubmissions('999001',{...h.deps,budget})).rejects.toMatchObject({code:'sec_unavailable'});
   expect(h.calls).toEqual([]);expect(h.raw.objects.size).toBe(0);
  });
+ it('spaces successive and concurrent calls through the shared process-wide pacer when none is injected',async()=>{
+  const stamps:number[]=[];
+  const f=(async()=>{stamps.push(Date.now());return new Response(MAIN,{status:200});}) as typeof globalThis.fetch;
+  const deps={fetch:f,raw:memoryRawStore()};
+  await fetchSubmissions('999001',deps);
+  await Promise.all([fetchSubmissions('999001',deps),fetchSubmissions('999001',{...deps,raw:memoryRawStore()})]);
+  await submissionsClient(deps).fetch('999001');
+  expect(stamps).toHaveLength(4);
+  for(let i=1;i<stamps.length;i++)expect(stamps[i]-stamps[i-1]).toBeGreaterThanOrEqual(SEC_MIN_INTERVAL_MS-5);
+ });
  it('maps HTTP errors and network failures to sec_unavailable and a CIK mismatch to invalid_schema',async()=>{
   const code=async(p:Promise<unknown>)=>p.then(()=>null,(e:unknown)=>e instanceof SecSubmissionsError?e.code:'other');
   expect(await code(fetchSubmissions('999001',harness({[MAIN_URL]:()=>new Response('nope',{status:404})}).deps))).toBe('sec_unavailable');
@@ -117,11 +140,11 @@ describe('submissionsEvidenceClaims',()=>{
   expect(claims.map(c=>[c.op,c.id_type,c.value,c.source])).toEqual([['evidence_only','ticker','0000999001-25-000031','sec_submissions'],['evidence_only','ticker','0000999001-01-000001','sec_submissions']]);
   expect(claims[0].detail).toEqual({schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:ISSUER},
    params:{suggested_op:'close_security',accession:'0000999001-25-000031',form:'25-NSE',filing_date:'2025-09-12',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
-   evidence:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:sha(MAIN),locator:'filings.recent[1]',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
+   evidence:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:sha(MAIN),locator:'recent#accessionNumber=0000999001-25-000031',note:'Rule 12d2-2(d) 下退市于申报后 10 日生效，须核对原文所指类别'},
    sources:[claims[0].detail.evidence]});
   expect(claims[1].detail.params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
   expect(claims[1].detail.evidence.evidence_sha256).toBe(sha(PAGE));
-  expect(claims[1].detail.evidence.locator).toBe('CIK0000999001-submissions-001.json[1]');
+  expect(claims[1].detail.evidence.locator).toBe('CIK0000999001-submissions-001.json#accessionNumber=0000999001-01-000001');
   // locators and evidence must pass the public-provenance guards (no '?', '#', key=/token: text)
   for(const c of claims)expect(()=>sanitizeProvenance({valid_from:c.detail.evidence},['valid_from'])).not.toThrow();
  });
diff --git a/src/lib/entities/identifiers/sec-submissions.ts b/src/lib/entities/identifiers/sec-submissions.ts
index 2470574..c0a7d65 100644
--- a/src/lib/entities/identifiers/sec-submissions.ts
+++ b/src/lib/entities/identifiers/sec-submissions.ts
@@ -7,6 +7,7 @@
 // column has one entry per accession). 8-A12B/8-A12G/25/25-NSE become evidence_only claims that
 // never prefill a security or an effective date (the reviewer reads the filing, spec §4.2.1).
 import type {Budget} from '../../facts/types';
+import type {Pacer} from '../../facts/providers/shared';
 import {PacerError,createPacer} from '../../facts/providers/shared';
 import type {RawStore} from '../../dq/raw-store';
 import {normalizeCik} from '../../research/entity-keys/identifiers';
@@ -20,7 +21,7 @@ export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
 const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
 export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;
 
-export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string;index:number}
+export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
 export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
 export interface FormerName{name:string;from:string|null;to:string|null}
 export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
@@ -60,7 +61,7 @@ function columnar(o:unknown,page:string):SubmissionFiling[]{
   if(typeof a!=='string'||typeof fd[i]!=='string'||typeof form[i]!=='string')throw invalid(`${page}: row ${i}`);
   const x=ix?.[i];
   return {accessionNumber:a,filingDate:fd[i] as string,reportDate:text(rd?.[i]),acceptanceDateTime:text(ad?.[i]),form:form[i] as string,
-   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page,index:i};
+   primaryDocument:text(pd?.[i]),isInlineXBRL:x===1||x===true?true:x===0||x===false?false:null,page};
  });
 }
 const parseJson=(json:string,what:string)=>{try{return JSON.parse(json) as unknown;}catch{throw invalid(`${what}: not JSON`);}};
@@ -75,18 +76,21 @@ export function parseSubmissions(json:string):ParsedSubmissions{
  try{cik=normalizeCik(d.cik);}catch{throw invalid('cik');}
  const filings=d.filings as {recent?:unknown;files?:unknown}|undefined;
  if(!filings||typeof filings!=='object')throw invalid('filings');
+ // Absent or malformed tickers / files are NOT empty lists: consumers read [] as "SEC lists none", so they fail instead.
+ const requiredArray=(v:unknown,what:string):unknown[]=>{if(!Array.isArray(v))throw invalid(what);return v;};
+ const requiredStrings=(v:unknown,what:string)=>requiredArray(v,what).map(x=>{if(typeof x!=='string')throw invalid(what);return x;});
  const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
  const fye=text(d.fiscalYearEnd);
  return {
   cik,name:text(d.name),category:text(d.category),
   fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
-  tickers:strings(d.tickers).map(t=>t.trim().toUpperCase()),exchanges:strings(d.exchanges),
+  tickers:requiredStrings(d.tickers,'tickers').map(t=>t.trim().toUpperCase()).filter(t=>t!==''),exchanges:strings(d.exchanges),
   formerNames:(Array.isArray(d.formerNames)?d.formerNames:[]).flatMap(f=>{
    const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
    return n?[{name:n,from:text(o.from),to:text(o.to)}]:[];
   }),
   filings:columnar(filings.recent,'recent'),
-  files:(Array.isArray(filings.files)?filings.files:[]).map(f=>{
+  files:requiredArray(filings.files,'filings.files').map(f=>{
    const o=(f&&typeof f==='object'?f:{}) as Record<string,unknown>;const n=text(o.name);
    if(!n||!PAGE_NAME.test(n))throw invalid('files[].name');
    return {name:n,filingCount:typeof o.filingCount==='number'?o.filingCount:null,filingFrom:text(o.filingFrom),filingTo:text(o.filingTo)};
@@ -94,16 +98,19 @@ export function parseSubmissions(json:string):ParsedSubmissions{
  };
 }
 
-export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget}
+export interface FetchSubmissionsDeps{fetch:typeof fetch;raw:RawStore;userAgent?:string;sleep?:(ms:number,signal?:AbortSignal)=>Promise<void>;now?:()=>number;clock?:()=>Date;budget?:Budget;
+ /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}
 
 const FETCH_TIMEOUT_MS=30_000;
+// Process-wide: SEC's limit is per source address, so all callers share one serialised pacer (>= 120 ms between requests).
+const SEC_PACER:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
 const unlimited=():Budget=>({remainingMs:()=>Number.POSITIVE_INFINITY,signal:new AbortController().signal});
 
 export function submissionsClient(deps:FetchSubmissionsDeps){
  const ua=deps.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
  const clock=deps.clock??(()=>new Date());
  const budget=deps.budget??unlimited();
- const pacer=createPacer(SEC_MIN_INTERVAL_MS);   // one pacer per client: >= 120 ms between its requests
+ const pacer=deps.pacer??SEC_PACER;
  // The User-Agent may contain a contact address: it goes on the request only, never into raw metadata.
  const get=async(url:string,cik:string,name:string):Promise<{bytes:Uint8Array;doc:StoredDoc}>=>{
   try{
@@ -168,7 +175,7 @@ export function submissionsEvidenceClaims(issuerId:string,snap:SubmissionsSnapsh
   const rule=Object.prototype.hasOwnProperty.call(EVIDENCE_FORMS,f.form)?EVIDENCE_FORMS[f.form]:null;
   const sha=rule?shaOf(f.page):null;
   if(!rule||!sha)return [];
-  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page==='recent'?'filings.recent':f.page}[${f.index}]`,note:rule.note};
+  const evidence:ClaimEvidence={source:'sec_submissions',as_of:asOf,evidence_sha256:sha,locator:`${f.page}#accessionNumber=${f.accessionNumber}`,note:rule.note};
   return [{issuer_id:issuerId,id_type:'ticker' as const,value:f.accessionNumber,source:'sec_submissions',op:'evidence_only' as const,detail:{
    schema:'claim/1' as const,evidence_kind:'filing_form' as const,target:{issuer_id:issuerId},
    params:{suggested_op:rule.suggested_op,accession:f.accessionNumber,form:f.form,filing_date:f.filingDate,note:rule.note},evidence,sources:[evidence],
diff --git a/src/lib/entities/submissions-evidence.test.ts b/src/lib/entities/submissions-evidence.test.ts
index 6e75782..7736261 100644
--- a/src/lib/entities/submissions-evidence.test.ts
+++ b/src/lib/entities/submissions-evidence.test.ts
@@ -24,6 +24,7 @@ describe('applySubmissionsEvidence',()=>{
   expect(c.rows('security_aliases')).toEqual([expect.objectContaining({alias:'ZZ Fixture Corp',ticker:'ZZF',alias_type:'name',source:'sec_submissions'})]);
   expect(c.rows('issuer_identifier_claims').map(r=>[r.op,r.value])).toEqual([['evidence_only','0000999001-25-000031'],['evidence_only','0000999001-01-000001']]);
   expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')).toMatchObject({issuer_id:ISSUER,valid_from:'2026-11-05',valid_from_method:'first_observed',source:'sec_submissions',share_class:'unknown',is_primary:false});
+  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')?.provenance).toEqual({valid_from:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}});
   expect(first.counts).toMatchObject({inserted:2,failed:0});
   expect(first.claims).toEqual({evidence_only:2});
   const again=await applySubmissionsEvidence(c,input);
@@ -35,7 +36,9 @@ describe('applySubmissionsEvidence',()=>{
   const c=client();
   await c.insert('issuer_securities',sec(OTHER,'ZZFX'));
   const res=await applySubmissionsEvidence(c,{issuerId:ISSUER,primaryTicker:null,snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZFX'])});
-  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,natural_key:'ZZFX:2026-11-05',reason_code:'ownership_conflict'})]);
+  const snap=await snapshot();
+  expect(c.rows('dq_quarantine')).toEqual([expect.objectContaining({dataset:DATASET,natural_key:'ZZFX:2026-11-05',reason_code:'ownership_conflict',
+   detail:expect.objectContaining({sec_ticker:'ZZFX',locator:'tickers[0]',fetched_at:expect.any(String),evidence_sha256:snap.main.sha256,raw_path:snap.main.path})})]);
   expect(c.rows('security_aliases')).toEqual([]);
   expect(res.skippedSummary).toEqual({no_primary_ticker:1});
   const none=await applySubmissionsEvidence(client(),{issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF'])});
diff --git a/src/lib/entities/submissions-evidence.ts b/src/lib/entities/submissions-evidence.ts
index feb04f8..72276fe 100644
--- a/src/lib/entities/submissions-evidence.ts
+++ b/src/lib/entities/submissions-evidence.ts
@@ -32,7 +32,7 @@ export async function applySubmissionsEvidence(tables:TableClient,input:Submissi
   catch(e){counts.failed++;errors.push({code:'claim_error',key:c.value,message:errorMessage(e)});}
  }
  const held=new Set((await tables.select('issuer_securities',{issuer_id:input.issuerId,valid_to:null})).map(r=>String(r.ticker)));
- for(const raw of input.snapshot.parsed.tickers){
+ for(const [at,raw] of input.snapshot.parsed.tickers.entries()){
   const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
   if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
   if(held.has(ticker)){counts.duplicates++;continue;}
@@ -41,7 +41,7 @@ export async function applySubmissionsEvidence(tables:TableClient,input:Submissi
    if(res==='inserted')counts.inserted++;
    else if(res==='duplicate')counts.duplicates++;
    else await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode:'ownership_conflict',
-    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions'},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
+    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions',sec_ticker:raw,locator:`tickers[${at}]`,fetched_at:input.snapshot.fetchedAt,evidence_sha256:input.snapshot.main.sha256,raw_path:input.snapshot.main.path},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
     counts,errors,{code:'ownership_conflict',key:ticker});
   }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
  }
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
import {PacerError,createPacer} from '../../facts/providers/shared';
import type {RawStore} from '../../dq/raw-store';
import {normalizeCik} from '../../research/entity-keys/identifiers';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import type {ClaimInput} from '../claims';
import type {ClaimEvidence} from '../types';

export const SEC_SUBMISSIONS_BASE='https://data.sec.gov/submissions/';
export const SEC_MIN_INTERVAL_MS=120;
export const SUBMISSIONS_PARSER_VERSION='sec-submissions/1';
const PAGE_NAME=/^CIK\d{10}-submissions-\d{3}\.json$/;
export const submissionsUrl=(cik:string)=>`${SEC_SUBMISSIONS_BASE}CIK${normalizeCik(cik).padStart(10,'0')}.json`;

export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
export interface SubmissionsPageRef{name:string;filingCount:number|null;filingFrom:string|null;filingTo:string|null}
export interface FormerName{name:string;from:string|null;to:string|null}
export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
export interface StoredDoc{name:string;sha256:string;path:string}
export interface SubmissionsSnapshot{cik:string;fetchedAt:string;main:StoredDoc;pages:StoredDoc[];parsed:ParsedSubmissions;complete:boolean}
export class SecSubmissionsError extends Error{
 constructor(readonly code:'sec_unavailable'|'invalid_schema',detail?:string){super(detail?`${code}: ${detail}`:code);this.name='SecSubmissionsError';}
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
 const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'&&x.trim()!==''):[];
 const fye=text(d.fiscalYearEnd);
 return {
  cik,name:text(d.name),category:text(d.category),
  fiscalYearEnd:fye&&/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(fye)?fye:null,
  tickers:requiredStrings(d.tickers,'tickers').map(t=>t.trim().toUpperCase()).filter(t=>t!==''),exchanges:strings(d.exchanges),
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
// Process-wide: SEC's limit is per source address, so all callers share one serialised pacer (>= 120 ms between requests).
const SEC_PACER:Pacer=createPacer(SEC_MIN_INTERVAL_MS);
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
   // Evidence first: the failure body is kept as received (an aborted budget starts no upload), then the failure is reported.
   try{await deps.raw.put({kind:'sec-submissions',bytes,contentType,meta:{cik,name,http_status:res.status}},budget);}
   catch(e){throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status} (raw not stored: ${e instanceof Error?e.message:String(e)})`);}
   throw new SecSubmissionsError('sec_unavailable',`${name}: HTTP ${res.status}`);
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
   const parsed=parseSubmissions(new TextDecoder().decode(main.bytes));
   if(parsed.cik!==c)throw invalid(`cik ${parsed.cik} != ${c}`);
   const from=opts.coverFrom??null;
   const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
   const pages:StoredDoc[]=[];
   const filings=[...parsed.filings];
   const seen=new Set(filings.map(f=>f.accessionNumber));
   for(const f of wanted){
    const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
    pages.push(p.doc);
    for(const x of parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
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
 for(const [at,raw] of input.snapshot.parsed.tickers.entries()){
  const ticker=input.universe.has(raw)?raw:normalizeSecurityTicker(raw,'US');
  if(!ticker||!input.universe.has(ticker)){skip('ticker_not_in_universe');continue;}
  if(held.has(ticker)){counts.duplicates++;continue;}
  try{
   const res=await attachSecurity(tables,{issuer_id:input.issuerId,ticker,share_class:'unknown',is_primary:false,valid_from:input.asOf,valid_from_method:'first_observed',source:'sec_submissions',provenance:{valid_from:{source:'sec_submissions',as_of:input.asOf,evidence_sha256:input.snapshot.main.sha256}}});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else await parkConflict(tables,{dataset:input.dataset,table:'issuer_securities',naturalKey:`${ticker}:${input.asOf}`,reasonCode:'ownership_conflict',
    detail:{reason:'ticker_owned_by_other_issuer',source:'sec_submissions',sec_ticker:raw,locator:`tickers[${at}]`,fetched_at:input.snapshot.fetchedAt,evidence_sha256:input.snapshot.main.sha256,raw_path:input.snapshot.main.path},payload:{issuer_id:input.issuerId,ticker,valid_from:input.asOf},batchId:input.batchId},
    counts,errors,{code:'ownership_conflict',key:ticker});
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:ticker,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
}

exec
/bin/zsh -lc "cat ../../../AGENTS.md; ls -a | head -30; cat src/lib/facts/providers/shared.ts; cat src/lib/entities/provenance.ts; rg 'SubmissionFiling|\\.index\\b' src/lib/entities -n | head -50; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
src/lib/entities/identifiers/sec-submissions.ts:24:export interface SubmissionFiling{accessionNumber:string;filingDate:string;reportDate:string|null;acceptanceDateTime:string|null;form:string;primaryDocument:string|null;isInlineXBRL:boolean|null;page:string}
src/lib/entities/identifiers/sec-submissions.ts:27:export interface ParsedSubmissions{cik:string;name:string|null;category:string|null;fiscalYearEnd:string|null;tickers:string[];exchanges:string[];formerNames:FormerName[];filings:SubmissionFiling[];files:SubmissionsPageRef[]}
src/lib/entities/identifiers/sec-submissions.ts:47:function columnar(o:unknown,page:string):SubmissionFiling[]{
src/lib/entities/identifiers/sec-submissions.ts:69:export function parseSubmissionsPage(json:string,name:string):SubmissionFiling[]{return columnar(parseJson(json,name),name);}
src/lib/entities/identifiers/plan.ts:78: const openfigiEvidence=(r:OkResult):ClaimEvidence=>({source:'openfigi',as_of:asOf,evidence_sha256:r.evidence.response_sha256,locator:`openfigi:${r.evidence.response_sha256}#${r.evidence.index}`});
src/lib/entities/identifiers/plan.ts:119:    const locator=`gleif:${iss.lei},${isin};openfigi:${r.evidence.response_sha256}#${r.evidence.index}`;
src/lib/entities/identifiers/openfigi.test.ts:104:  expect(r.evidence.index).toBe(4);
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
/bin/zsh -lc "rg 'fetchSubmissions|submissionsClient|parseSubmissions\\(' src scripts -n; sed -n '1,30p' src/lib/entities/submissions-evidence.test.ts; find . -name 'AGENTS*' -not -path './node_modules/*'; git status --short; ls vitest*; rg 'locator|sanitize' src/lib/entities/claims.ts -n" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 67ms:
scripts/entity-keys/probe-submissions.ts:10:import {fetchSubmissions} from '../../src/lib/entities/identifiers/sec-submissions';
scripts/entity-keys/probe-submissions.ts:16: const s=await fetchSubmissions(cik,{fetch,raw},{coverFrom:'1993-01-01'});
scripts/entity-keys/sec-submissions.ts:15:import {SUBMISSIONS_PARSER_VERSION,SecSubmissionsError,submissionsClient,submissionsEvidenceClaims} from '../../src/lib/entities/identifiers/sec-submissions';
scripts/entity-keys/sec-submissions.ts:41: const client=submissionsClient({fetch,raw});
src/lib/entities/submissions-evidence.test.ts:6:import {fetchSubmissions} from './identifiers/sec-submissions';
src/lib/entities/submissions-evidence.test.ts:14:const snapshot=()=>fetchSubmissions('999001',{fetch,raw:memoryRawStore(),sleep:async()=>{}},{coverFrom:'1993-01-01'});
src/lib/entities/identifiers/sec-submissions.test.ts:9: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
src/lib/entities/identifiers/sec-submissions.test.ts:10: submissionsCategory,submissionsClient,submissionsEvidenceClaims,submissionsUrl,
src/lib/entities/identifiers/sec-submissions.test.ts:32:  const p=parseSubmissions(PLTR);
src/lib/entities/identifiers/sec-submissions.test.ts:40:  const p=parseSubmissions(MAIN);
src/lib/entities/identifiers/sec-submissions.test.ts:57:  const code=(d:unknown)=>{try{parseSubmissions(JSON.stringify(d));return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
src/lib/entities/identifiers/sec-submissions.test.ts:65:  expect(parseSubmissions(JSON.stringify({...doc,tickers:[],filings:{...doc.filings,files:[]}}))).toMatchObject({tickers:[],files:[]});
src/lib/entities/identifiers/sec-submissions.test.ts:68:  const bad=(s:string)=>{try{parseSubmissions(s);return null;}catch(e){return e instanceof SecSubmissionsError?e.code:'other';}};
src/lib/entities/identifiers/sec-submissions.test.ts:77:describe('submissionsClient',()=>{
src/lib/entities/identifiers/sec-submissions.test.ts:80:  const s=await fetchSubmissions('999001',h.deps);
src/lib/entities/identifiers/sec-submissions.test.ts:90:  const s=await submissionsClient(h.deps).fetch('999001',{coverFrom:'2001-01-01'});
src/lib/entities/identifiers/sec-submissions.test.ts:97:  const later=await submissionsClient(harness({[MAIN_URL]:json(MAIN)}).deps).fetch('999001',{coverFrom:'2015-01-01'});
src/lib/entities/identifiers/sec-submissions.test.ts:102:  await fetchSubmissions('999001',h.deps);
src/lib/entities/identifiers/sec-submissions.test.ts:106:  await expect(fetchSubmissions('999001',f.deps)).rejects.toMatchObject({code:'sec_unavailable'});
src/lib/entities/identifiers/sec-submissions.test.ts:114:  await expect(fetchSubmissions('999001',{...h.deps,budget})).rejects.toMatchObject({code:'sec_unavailable'});
src/lib/entities/identifiers/sec-submissions.test.ts:121:  await fetchSubmissions('999001',deps);
src/lib/entities/identifiers/sec-submissions.test.ts:122:  await Promise.all([fetchSubmissions('999001',deps),fetchSubmissions('999001',{...deps,raw:memoryRawStore()})]);
src/lib/entities/identifiers/sec-submissions.test.ts:123:  await submissionsClient(deps).fetch('999001');
src/lib/entities/identifiers/sec-submissions.test.ts:129:  expect(await code(fetchSubmissions('999001',harness({[MAIN_URL]:()=>new Response('nope',{status:404})}).deps))).toBe('sec_unavailable');
src/lib/entities/identifiers/sec-submissions.test.ts:130:  expect(await code(fetchSubmissions('999001',harness({}).deps))).toBe('sec_unavailable');
src/lib/entities/identifiers/sec-submissions.test.ts:131:  expect(await code(fetchSubmissions('999002',harness({'https://data.sec.gov/submissions/CIK0000999002.json':json(MAIN)}).deps))).toBe('invalid_schema');
src/lib/entities/identifiers/sec-submissions.test.ts:138:  const s=await fetchSubmissions('999001',h.deps,{coverFrom:'1993-01-01'});
src/lib/entities/identifiers/sec-submissions.ts:3:// One fetch per CIK serves several consumers. submissionsClient paces requests (declared
src/lib/entities/identifiers/sec-submissions.ts:71:export function parseSubmissions(json:string):ParsedSubmissions{
src/lib/entities/identifiers/sec-submissions.ts:102: /** Default: one process-wide SEC pacer shared by every client and fetchSubmissions call. Tests inject their own for isolation. */pacer?:Pacer}
src/lib/entities/identifiers/sec-submissions.ts:109:export function submissionsClient(deps:FetchSubmissionsDeps){
src/lib/entities/identifiers/sec-submissions.ts:144:   const parsed=parseSubmissions(new TextDecoder().decode(main.bytes));
src/lib/entities/identifiers/sec-submissions.ts:161:export const fetchSubmissions=(cik:string,deps:FetchSubmissionsDeps,opts:{coverFrom?:string|null}={})=>submissionsClient(deps).fetch(cik,opts);
// src/lib/entities/submissions-evidence.test.ts
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {memoryRawStore} from '../dq/raw-store';
import {fetchSubmissions} from './identifiers/sec-submissions';
import {applySubmissionsEvidence} from './submissions-evidence';

const MAIN=readFileSync(new URL('./fixtures/sec-submissions/zz-main.json',import.meta.url),'utf8');
const PAGE=readFileSync(new URL('./fixtures/sec-submissions/zz-page-001.json',import.meta.url),'utf8');
const ISSUER='10000000-0000-4000-8000-000000000009',OTHER='10000000-0000-4000-8000-00000000000a';
const BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.sec-submissions';
const fetch=(async(u:string|URL|Request)=>new Response(String(u).endsWith('-001.json')?PAGE:MAIN,{status:200})) as typeof globalThis.fetch;
const snapshot=()=>fetchSubmissions('999001',{fetch,raw:memoryRawStore(),sleep:async()=>{}},{coverFrom:'1993-01-01'});
const sec=(issuer_id:string,ticker:string,o:Record<string,unknown>={})=>({issuer_id,ticker,isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'sec_company_tickers_exchange',provenance:{},...o});
const client=()=>memoryTableClient({security_aliases:['alias','ticker','alias_type'],issuer_identifier_claims:['id'],dq_quarantine:['id']});

describe('applySubmissionsEvidence',()=>{
 it('writes former-name aliases on the primary row, evidence claims and SEC-only tickers; a replay changes nothing',async()=>{
  const c=client();
  await c.insert('issuer_securities',sec(ISSUER,'ZZF'));
  const input={issuerId:ISSUER,primaryTicker:'ZZF',snapshot:await snapshot(),asOf:'2026-11-05',batchId:BATCH,dataset:DATASET,universe:new Set(['ZZF','ZZFX'])};
  const first=await applySubmissionsEvidence(c,input);
  expect(c.rows('security_aliases')).toEqual([expect.objectContaining({alias:'ZZ Fixture Corp',ticker:'ZZF',alias_type:'name',source:'sec_submissions'})]);
  expect(c.rows('issuer_identifier_claims').map(r=>[r.op,r.value])).toEqual([['evidence_only','0000999001-25-000031'],['evidence_only','0000999001-01-000001']]);
  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')).toMatchObject({issuer_id:ISSUER,valid_from:'2026-11-05',valid_from_method:'first_observed',source:'sec_submissions',share_class:'unknown',is_primary:false});
  expect(c.rows('issuer_securities').find(r=>r.ticker==='ZZFX')?.provenance).toEqual({valid_from:{source:'sec_submissions',as_of:'2026-11-05',evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/)}});
  expect(first.counts).toMatchObject({inserted:2,failed:0});
  expect(first.claims).toEqual({evidence_only:2});
  const again=await applySubmissionsEvidence(c,input);
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Rrtfkc0Y' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7uN2H6Rs' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md
vitest.config.ts
11:import {ProvenanceError,sanitizeProvenance} from './provenance';
42: &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');
116:  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
133:export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
138:  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),

codex
The new conflict evidence can point to the wrong raw ticker because parsing removes entries before locator indices are assigned.

Review comment:

- [P2] Preserve original ticker positions for conflict evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/submissions-evidence.ts:44-44
  When the SEC document contains a blank ticker before a conflicting ticker, `parseSubmissions()` filters the blank out, so `at` indexes the normalized array rather than the stored raw document. For example, `tickers: ["", "ZZFX"]` produces a conflict locator of `tickers[0]`, which points to the blank instead of `ZZFX`. Preserve original positions during parsing, or reject blank entries, so the quarantine locator identifies the actual evidence in the hashed document.
The new conflict evidence can point to the wrong raw ticker because parsing removes entries before locator indices are assigned.

Review comment:

- [P2] Preserve original ticker positions for conflict evidence — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/submissions-evidence.ts:44-44
  When the SEC document contains a blank ticker before a conflicting ticker, `parseSubmissions()` filters the blank out, so `at` indexes the normalized array rather than the stored raw document. For example, `tickers: ["", "ZZFX"]` produces a conflict locator of `tickers[0]`, which points to the blank instead of `ZZFX`. Preserve original positions during parsing, or reject blank entries, so the quarantine locator identifies the actual evidence in the hashed document.

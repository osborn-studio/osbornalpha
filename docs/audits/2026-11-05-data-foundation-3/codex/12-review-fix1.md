OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0b0-7830-7bc2-a23c-fbac05b06d5a
--------
user
commit c519460
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat c519460; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2412ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-1YbPb5xe' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ZfNzEDKV' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/12-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/12-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hiTDyuL9' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-2MCczR66' (errno=Operation not permitted)
commit c519460706a2c634c1d688e093d027f8c39afe64
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:48:14 2026 -0800

    fix(facts): acceptance step counters and partial status, budget guard, mismatch-before-skip, cross-page conflicts (Task 12 review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/entities/identifiers/sec-submissions.ts |  6 ++--
 src/lib/facts/deps.ts                           |  4 +--
 src/lib/facts/providers/sec-acceptance.test.ts  | 37 +++++++++++++++++++++++++
 src/lib/facts/providers/sec-acceptance.ts       | 15 +++++++---
 src/lib/facts/sync.test.ts                      |  9 ++++++
 src/lib/facts/sync.ts                           |  7 +++--
 6 files changed, 68 insertions(+), 10 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../..; do ls "$d"/AGENTS* 2>/dev/null; done; git show c519460 --; cat src/lib/facts/providers/sec-acceptance.ts; cat src/lib/facts/sync.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qByhVTao' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-44YE928h' (errno=Operation not permitted)
commit c519460706a2c634c1d688e093d027f8c39afe64
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 03:48:14 2026 -0800

    fix(facts): acceptance step counters and partial status, budget guard, mismatch-before-skip, cross-page conflicts (Task 12 review)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/identifiers/sec-submissions.ts b/src/lib/entities/identifiers/sec-submissions.ts
index f904d72..ad331dd 100644
--- a/src/lib/entities/identifiers/sec-submissions.ts
+++ b/src/lib/entities/identifiers/sec-submissions.ts
@@ -160,11 +160,13 @@ export function submissionsClient(deps:FetchSubmissionsDeps){
    const wanted=from===null?[]:parsed.files.filter(f=>f.filingTo===null||f.filingTo>=from);
    const pages:StoredDoc[]=[];
    const filings=[...parsed.filings];
-   const seen=new Set(filings.map(f=>f.accessionNumber));
+   // An accession repeated across pages is kept once only when the copies agree; a copy with a different filingDate/acceptanceDateTime is KEPT so consumers can see the conflict (additive: plan 3 Task 12).
+   const sig=(f:SubmissionFiling)=>`${f.accessionNumber}|${f.filingDate}|${f.acceptanceDateTime??''}`;
+   const seen=new Set(filings.map(sig));
    for(const f of wanted){
     const p=await get(`${SEC_SUBMISSIONS_BASE}${f.name}`,c,f.name);
     pages.push(p.doc);
-    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(x.accessionNumber)){seen.add(x.accessionNumber);filings.push(x);}
+    for(const x of parseStored(p.doc,()=>parseSubmissionsPage(new TextDecoder().decode(p.bytes),f.name)))if(!seen.has(sig(x))){seen.add(sig(x));filings.push(x);}
    }
    return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
   },
diff --git a/src/lib/facts/deps.ts b/src/lib/facts/deps.ts
index 7151dd3..ec4c89c 100644
--- a/src/lib/facts/deps.ts
+++ b/src/lib/facts/deps.ts
@@ -1,8 +1,8 @@
 // src/lib/facts/deps.ts
 // Production wiring of SyncDeps (spec §6.1) shared by /api/cron/facts-sync and scripts/facts/*:
 // Supabase FactsDb / TableClient / snapshot store, the two adapters (fetch + parse), the cninfo
-// linker, and step 9b (SEC acceptance times through sec-submissions.ts), which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass
-// (it hands over the FilingRow only). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
+// linker (which needs the issuer's A-share ts_code and cninfo_org_id that sync.ts does not pass:
+// it hands over the FilingRow only), and step 9b (SEC acceptance times through sec-submissions.ts). code_version = VERCEL_GIT_COMMIT_SHA (40 hex), else — scripts
 // only — `git rev-parse HEAD` with "-dirty" when the tree has changes (sync.ts::resolveCodeVersion,
 // which this delegates to); null means "refuse to apply".
 import {getAdminSupabase} from '../supabase/admin';
diff --git a/src/lib/facts/providers/sec-acceptance.test.ts b/src/lib/facts/providers/sec-acceptance.test.ts
index a7bfc5f..0a4dc76 100644
--- a/src/lib/facts/providers/sec-acceptance.test.ts
+++ b/src/lib/facts/providers/sec-acceptance.test.ts
@@ -6,6 +6,9 @@ import {filingInsert} from '../db-contract';
 import {memoryFactsDb} from '../memory-facts-db';
 import {FactsDbError} from '../types';
 import type {Budget} from '../types';
+import {memoryRawStore} from '../../dq/raw-store';
+import {createPacer} from './shared';
+import {SEC_MIN_INTERVAL_MS,fetchSubmissions} from '../../entities/identifiers/sec-submissions';
 import {acceptanceIndex,enrichAcceptance,parseAcceptanceDateTime} from './sec-acceptance';
 
 const budget:Budget={remainingMs:()=>60_000,signal:new AbortController().signal};
@@ -111,3 +114,37 @@ describe('enrichAcceptance (spec §4.5)',()=>{
   expect(none).not.toHaveBeenCalled();
  });
 });
+
+describe('enrichAcceptance review fixes (Task 12 Codex)',()=>{
+ const cik='0000320193';
+ it('a time-less entry with a different filingDate is a mismatch first; with the same date it is acceptance_not_found',async()=>{
+  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
+  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:cik}]);await db.claimLease(iss,'US',b,600);
+  const run=await db.beginRun(iss,'US',b,1);
+  const a=filingInsert(iss,{sourceRef:'0000320193-24-000010',availableDate:'2024-02-01'}),c=filingInsert(iss,{sourceRef:'0000320193-24-000011',availableDate:'2024-03-01'});
+  await db.stageFilings(run,[a,c]);await db.publishRun(run,[a.filing_id,c.filing_id]);
+  const snap=snapshot([entry(a.sourceRef,'2024-02-02',null),entry(c.sourceRef,'2024-03-01','bad')]);
+  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:cik},budget);
+  expect(out.mismatches).toHaveLength(1);expect(out.counts).toMatchObject({fetched:1,failed:1,inserted:0});
+  expect(out.errors[0].message).toContain('"acceptance_not_found":1');
+ });
+ it('stops starting writes when the budget is spent and reports deadline_hit with the remaining count',async()=>{
+  const {db,iss,snap}=await seeded();
+  let n=0;const b:Budget={remainingMs:()=>(n++<1?60_000:0),signal:new AbortController().signal};
+  const out=await enrichAcceptance({db,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},b);
+  const hit=out.errors.find(e=>e.code==='deadline_hit');
+  expect(hit).toBeDefined();expect(JSON.parse(hit!.message!).remaining).toBeGreaterThan(0);
+ });
+ it('fetchSubmissions keeps conflicting duplicates from recent/history; enrichAcceptance writes nothing for that accession (acceptance_ambiguous, failed)',async()=>{
+  const {db,iss,ok}=await seeded();
+  const main=JSON.stringify({cik,name:'X',tickers:['X'],exchanges:[],filings:{recent:{accessionNumber:[ok.sourceRef],filingDate:['2024-02-01'],reportDate:[''],acceptanceDateTime:['2024-02-01T21:05:00.000Z'],form:['10-Q'],primaryDocument:['d.htm'],isInlineXBRL:[1]},
+   files:[{name:'CIK0000320193-submissions-001.json',filingCount:1,filingFrom:'2000-01-01',filingTo:'2024-02-01'}]}});
+  const page=JSON.stringify({accessionNumber:[ok.sourceRef],filingDate:['2024-02-01'],reportDate:[''],acceptanceDateTime:['2024-02-01T22:00:00.000Z'],form:['10-Q'],primaryDocument:['d.htm'],isInlineXBRL:[1]});
+  const fetchStub=(async(u:string|URL|Request)=>new Response(String(u).includes('-001')?page:main,{status:200,headers:{'content-type':'application/json'}})) as typeof fetch;
+  const raw=memoryRawStore();
+  const out=await enrichAcceptance({db,submissions:(c,bb,from)=>fetchSubmissions(c,{fetch:fetchStub,raw,pacer:createPacer(SEC_MIN_INTERVAL_MS),sleep:async()=>{},now:()=>0,budget:bb},{coverFrom:from}),recordDateMismatch:async()=>{}},{issuerId:iss,cik10:cik},budget);
+  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBeNull();
+  expect(out.errors[0].message).toContain('"acceptance_ambiguous":1');
+  expect(out.counts.failed).toBeGreaterThanOrEqual(1);
+ });
+});
diff --git a/src/lib/facts/providers/sec-acceptance.ts b/src/lib/facts/providers/sec-acceptance.ts
index 2a06f0e..053e138 100644
--- a/src/lib/facts/providers/sec-acceptance.ts
+++ b/src/lib/facts/providers/sec-acceptance.ts
@@ -84,10 +84,16 @@ export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:stri
  out.snapshotSha256=snap.main.sha256;
  const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
  const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
- let notFound=0,unrecorded=0;
- for(const f of pending){
+ const amb=new Set(ambiguous);
+ let notFound=0,unrecorded=0,ambiguousHit=0;
+ for(let i=0;i<pending.length;i++){
+  const f=pending[i];
+  if(budget.signal.aborted||budget.remainingMs()<=0){
+   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
+  }
+  if(amb.has(f.source_ref)){out.counts.fetched++;out.counts.failed++;ambiguousHit++;continue;}   // conflicting copies: never guess
   const e=index.get(f.source_ref);
-  if(!e||e.acceptedAt===null){notFound++;continue;}
+  if(!e){notFound++;continue;}
   out.counts.fetched++;
   if(e.filingDate!==f.available_date){
    const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
@@ -97,6 +103,7 @@ export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:stri
    }else unrecorded++;
    continue;
   }
+  if(e.acceptedAt===null){out.counts.fetched--;notFound++;continue;}
   try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
   catch(err){
    if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
@@ -105,7 +112,7 @@ export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:stri
  }
  const summary:Record<string,number>={};
  if(notFound>0)summary.acceptance_not_found=notFound;
- if(ambiguous.length>0)summary.acceptance_ambiguous=ambiguous.length;
+ if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
  if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
  if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
  return out;
diff --git a/src/lib/facts/sync.test.ts b/src/lib/facts/sync.test.ts
index c06492f..6f92bff 100644
--- a/src/lib/facts/sync.test.ts
+++ b/src/lib/facts/sync.test.ts
@@ -606,6 +606,15 @@ describe('runFactsSync — step 9b acceptance (plan 3 §4.5)',()=>{
   expect(r.issuers[0].errors).toContainEqual({code:'acceptance_failed',key:ISSUER,message:'sec down'});
   expect(r.status).toBe('partial');
  });
+ it('counts.failed>0 from the enrichment yields a non-informational error: batch partial, issuer published, counters kept',async()=>{
+  const failedOutcome={...outcome([]),counts:{fetched:2,inserted:0,duplicates:0,versioned:0,quarantined:0,failed:2}};
+  const {deps}=harness(FY23,{enrichAcceptance:async()=>failedOutcome});
+  const r=await run(deps);
+  expect(r.issuers[0].outcome).toBe('published');
+  expect(r.issuers[0].acceptance).toMatchObject({fetched:2,failed:2});
+  expect(r.issuers[0].errors).toContainEqual({code:'acceptance_failed',key:ISSUER,message:'{"failed":2}'});
+  expect(r.status).toBe('partial');
+ });
  it('is not called for CN',async()=>{
   const enrichAcceptance=vi.fn(async()=>outcome([]));
   const {deps}=harness(parsed([cnFiling()],[cnRevenue()]),{enrichAcceptance},CN_SCOPE);
diff --git a/src/lib/facts/sync.ts b/src/lib/facts/sync.ts
index 0b4b9f7..ec0d0e3 100644
--- a/src/lib/facts/sync.ts
+++ b/src/lib/facts/sync.ts
@@ -56,7 +56,7 @@ export interface SyncDeps{
 export interface SyncOptions{market:Market;limit:number;issuerIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;sinceYear?:number;mappingGen?:number}
 /** 'planned' is the dry-run outcome of an issuer that fetched, parsed and planned without writing. */
 export type IssuerOutcomeKind='published'|'planned'|'failed'|'skipped';
-export interface IssuerOutcome{issuerId:string;fetchKey:string;runId:string|null;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[];warnings:Map<string,string[]>;snapshotSha256:string[]}
+export interface IssuerOutcome{issuerId:string;fetchKey:string;runId:string|null;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[];warnings:Map<string,string[]>;snapshotSha256:string[];/** step 9b enrichment counters (US, when it ran); separate from counts */acceptance?:BatchCounts}
 export interface SyncDetail{attempted:number;published:number;failed:number;skipped:number;idle:boolean}
 /** detail is the same object recorded on dq_freshness (spec §6.1) so cron receipts and the runbook read one shape. */
 export interface SyncReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:IssuerOutcome[];idle:boolean;detail:SyncDetail}
@@ -289,7 +289,10 @@ export async function syncIssuerFacts(deps:SyncDeps,batchId:string,input:{scope:
   catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;return afterPublish(code,e);}   // published stays; retried on the failure schedule
   // 9b (plan 3 §4.5): acceptance times; best-effort after publication — errors are recorded, the outcome stays published
   if(market==='US'&&deps.enrichAcceptance&&!budget.signal.aborted&&budget.remainingMs()>0){
-   try{const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);}
+   try{
+    const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);out.acceptance=a.counts;
+    if(a.counts.failed>0)out.errors.push({code:'acceptance_failed',key:issuer,message:JSON.stringify({failed:a.counts.failed})});   // non-informational: the batch is partial, the issuer stays published
+   }
    catch(e){out.errors.push({code:'acceptance_failed',key:issuer,message:errMsg(e)});}
   }
   await releaseOnce('success');
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
//    false (same value already) → duplicates, acceptance_conflict → failed + error;
//  - filingDate ≠ available_date → a sec.filing_date_vs_submissions result (kind 'date', failed,
//    both dates as text) handed to the injected recordDateMismatch (record.ts, wired by plan-3
//    Part D) or returned unrecorded — and NO acceptance write (the filing's identity is in doubt);
//  - absent, ambiguous, or without a parseable acceptance time → skipped_summary
//    (acceptance_not_found / acceptance_ambiguous); never a guessed time.
// fetched counts the filings that reached a decision. A submissions failure → sec_unavailable.
import {emptyCounts} from '../../dq/batches';
import type {BatchCounts,BatchError} from '../../dq/batches';
import type {ReconcileResultInput} from '../../dq/reconcile/types';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {FactsDbError} from '../types';
import type {Budget,FactsDb,FilingRow} from '../types';

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
}
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

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const pending=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 if(pending.length===0)return out;
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){out.counts.fetched++;out.counts.failed++;ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  out.counts.fetched++;
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){out.counts.fetched--;notFound++;continue;}
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
// src/lib/facts/sync.ts
// Sync core (spec §6.1, §10). One ingest_batches row per call; per due issuer: lease → run →
// fetch → snapshot → parse → read + plan → stage → quarantine → publish → link (CN) →
// materialize → release. Every write goes through the injected FactsDb (lease-checked SQL
// functions); a lease_lost stops the issuer without any further database call; budget
// exhaustion abandons the in-flight run. Pure helpers (plan, rules) decide, this file sequences.
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {quarantine} from '../dq/quarantine';
import {RULES_VERSION} from '../dq/rules';
import {DATASETS,inventoryEntry} from '../dq/datasets';
import {FactsDbError} from './types';
import type {Budget,FactCandidate,FactsDb,FilingInsert,FilingRow,Market,ParseResult,RawSnapshot,ScopeRow,Source} from './types';
import {FACT_CONCEPTS,MAPPING_GEN,MAPPING_VERSION} from './concepts';
import {EDGAR_NUMBER_SCHEMA,TUSHARE_CONTROL_FIELDS} from './json-numbers';
import {SyncError} from './errors';
import {ambiguousKey,keyComponents} from './keys';
import {planFactWrites} from './plan';
import {evaluateFactRules,mergeWarnings,summarizeWarnings} from './rules';
import {snapshotPath} from './snapshot-store';
import type {SnapshotStore} from './snapshot-store';
import {reconcileScope,scopeRowFor} from './scope';
import type {ScopeInputRow} from './scope';
import {FORMULA_VERSION,materialize} from './derive';
import type {AcceptanceOutcome} from './providers/sec-acceptance';

/** Shape of providers/tushare-statements.ts::coverageSummary entries (the adapter is injected, never imported here). */
export interface CoverageEntry{api:string;report_type:number;years:Record<string,number>}
export interface SyncDeps{
 db:FactsDb;tables:TableClient;storage:SnapshotStore;
 fetchUs:(cik10:string,b:Budget)=>Promise<RawSnapshot>;
 fetchCn:(tsCode:string,sinceYear:number,b:Budget)=>Promise<RawSnapshot[]>;
 /** Adapters (Part C): parseCompanyFacts / parseTushareStatements wired by the route and scripts. */
 parseUs:(snapshot:RawSnapshot,opts:{sinceYear:number})=>ParseResult;
 parseCn:(snapshots:RawSnapshot[],opts:{sinceYear:number})=>ParseResult;
 /** 'unlinkable' = issuer metadata (no current A-share ticker) prevented any request: not an attempt, link_attempts stays untouched. */
 linkCn?:(filing:FilingRow,b:Budget)=>Promise<{document_ref:string;document_url:string}|'none'|'ambiguous'|'unlinkable'>;
 /** CN coverage summary (§6.3 coverage_summary), wired by deps.ts to coverageSummary (round-1 #12). */
 coverageCn?:(parsed:ParseResult)=>CoverageEntry[];
 /** Step 9b (plan 3 §4.5): SEC acceptance times for a published US issuer, from the issuer's scope fetch key (10-digit CIK). Wired by deps.ts; its errors join the issuer receipt and never fail a published issuer. */
 enrichAcceptance?:(issuer:string,cik10:string,b:Budget)=>Promise<AcceptanceOutcome>;
 now:()=>Date;deadline:Date|null;codeVersion:string|null;
}
/**
 * issuerIds given (scripts, replay tests): those issuers run directly — no reconcileScope first,
 * next_due_at ignored. Their scope rows are read by id; a missing row is computed from the issuer
 * tables (scopeRowFor): seeded through reconcileScope with reasons ['explicit'] when applying,
 * constructed read-only for a dry run. An issuer whose fetch_key cannot be derived is reported as
 * outcome 'failed' / code 'scope_unresolved' — never silently skipped (round-1 #13). `limit` applies
 * to the scheduled path only: every explicitly requested issuer is processed (round-2 #13).
 */
export interface SyncOptions{market:Market;limit:number;issuerIds?:string[];dryRun:boolean;triggeredBy:TriggeredBy;sinceYear?:number;mappingGen?:number}
/** 'planned' is the dry-run outcome of an issuer that fetched, parsed and planned without writing. */
export type IssuerOutcomeKind='published'|'planned'|'failed'|'skipped';
export interface IssuerOutcome{issuerId:string;fetchKey:string;runId:string|null;outcome:IssuerOutcomeKind;code?:string;counts:BatchCounts;errors:BatchError[];warnings:Map<string,string[]>;snapshotSha256:string[];/** step 9b enrichment counters (US, when it ran); separate from counts */acceptance?:BatchCounts}
export interface SyncDetail{attempted:number;published:number;failed:number;skipped:number;idle:boolean}
/** detail is the same object recorded on dq_freshness (spec §6.1) so cron receipts and the runbook read one shape. */
export interface SyncReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];issuers:IssuerOutcome[];idle:boolean;detail:SyncDetail}

const DAY=86_400_000;
export const LEASE_TTL_S=600;
export const MIN_ISSUER_MS=90_000;
export const NEXT_DUE_OK_MS=7*DAY;
export const NEXT_DUE_FAIL_MS=1*DAY;
export const MAX_LINK_ATTEMPTS=5;
/** Smallest budget left that still allows abandon + release (5 s) / a publish (2 s); lease is renewed when it lapses within 120 s. */
export const CLEANUP_MIN_MS=5_000;
export const PUBLISH_MIN_MS=2_000;
export const LEASE_RENEW_MS=120_000;
/** A stale plan is nobody's fault and retries soon, not on the 1-day failure schedule. */
export const NEXT_DUE_STALE_MS=10*60_000;
export const LINKABLE_FORMS=new Set(['annual','semiannual','q1','q3','restatement']);
const COUNTERS=['fetched','inserted','duplicates','versioned','quarantined','failed'] as const;
const ALL_CONCEPTS=FACT_CONCEPTS.map(c=>c.id);
const isoDate=(d:Date)=>d.toISOString().slice(0,10);
const errMsg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,200);
/** Thrown by phase() when the budget is spent: always a deadline, whatever the clock says afterwards. */
class DeadlineError extends Error{constructor(){super('deadline');this.name='DeadlineError';}}
/**
 * Budget exhaustion. phase()'s DeadlineError always counts. An abort/timeout error or a budget_* message
 * counts only while the budget really is spent (signal fired or less than CLEANUP_MIN_MS left): a
 * per-request timeout with budget remaining is a genuine failure (round-4 #3).
 */
const isDeadline=(e:unknown,budget:Budget)=>{
 if(e instanceof DeadlineError)return true;
 if(!(e instanceof Error))return false;
 const spent=budget.signal.aborted||budget.remainingMs()<CLEANUP_MIN_MS;
 return spent&&(e.name==='AbortError'||e.name==='TimeoutError'||/budget_(exhausted|aborted)/.test(e.message));
};
/**
 * parse_error text for the batch: a fixed vocabulary only. Parser messages can embed response content
 * (a native JSON SyntaxError quotes the input), so nothing outside the allowlist is ever persisted:
 * an unknown kind becomes the fixed `parse_error`; field names come from a known set (round-4 #1).
 */
const PARSE_KINDS=new Set(['invalid_json_number','invalid_decimal','reserved_key','entry_shape','raw_hash_invalid','invalid_row_width','invalid_control_field','filing_not_staged','companyfacts shape','snapshot api','snapshot report_type']);
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
 const fail=(code:string,message?:string)=>{out.outcome='failed';out.code=code;out.errors.push(message===undefined?{code,key:issuer}:{code,key:issuer,message});out.counts.failed+=Math.max(1,out.counts.fetched-out.counts.quarantined);return out;};
 const cleanupFailed=(step:string,e:unknown)=>{out.errors.push({code:'cleanup_failed',key:issuer,message:`${step}: ${errMsg(e)}`});};
 /** Renews the lease (same batch) when it would lapse within LEASE_RENEW_MS; a refused renewal is lease_lost. */
 const renewIfNeeded=async()=>{
  if(leaseUntil-deps.now().getTime()>=LEASE_RENEW_MS)return;
  if(!await db.claimLease(issuer,market,batchId,LEASE_TTL_S))throw new FactsDbError('lease_lost');
  leaseUntil=deps.now().getTime()+LEASE_TTL_S*1000;
 };
 /** Before every database phase: stop when the budget is spent (or has less than minMs left), then renew the lease. */
 const phase=async(minMs=1)=>{
  if(budget.signal.aborted||budget.remainingMs()<minMs)throw new DeadlineError();
  await renewIfNeeded();
 };
 // Cleanup never throws: a secondary failure is recorded as cleanup_failed next to the original code; a lost lease just stops further writes.
 // Only a run that is still staged can be abandoned: once publishRun committed the run is immutable
 // (abandon would raise run_published and mask the real failure) and its facts stay (round-1 #11).
 const abandonOnce=async()=>{
  if(runId===null||!leaseHeld||publishedRun||abandoned)return;abandoned=true;
  try{await db.abandonRun(runId);}catch(e){if(isLeaseLoss(e))leaseHeld=false;else cleanupFailed('abandon',e);}
 };
 const releaseOnce=async(outcome:'success'|'failed',delayMs?:number)=>{
  if(!leaseHeld||released)return;released=true;
  const next=new Date(deps.now().getTime()+(delayMs??(outcome==='success'?NEXT_DUE_OK_MS:NEXT_DUE_FAIL_MS))).toISOString();
  try{await db.releaseLease(issuer,market,batchId,outcome,next);}catch(e){if(isLeaseLoss(e))leaseHeld=false;else cleanupFailed('release',e);}
 };
 const cleanup=async(outcome:'success'|'failed',o:{delayMs?:number}={})=>{await abandonOnce();await releaseOnce(outcome,o.delayMs);};
 // Failure AFTER publication (link, materialize, release): the run stays published and the issuer
 // outcome stays 'published'; the original failure is recorded under its own code and the lease is
 // released as failed so the issuer returns in a day for the post-publish work (round-1 #11).
 const afterPublish=async(code:string,e:unknown)=>{out.errors.push({code,key:issuer,message:errMsg(e)});await releaseOnce('failed');return out;};
 try{
  runId=await db.beginRun(issuer,market,batchId,gen);out.runId=runId;
  const {parsed,sha256s}=await fetchAndParse(deps,market,issuer,scope.fetch_key,sinceYear,budget,true);
  out.snapshotSha256=sha256s;
  out.counts.fetched=parsed.candidates.length+parsed.ambiguous.reduce((n,a)=>n+a.candidates.length,0)+parsed.oddDuration.length+parsed.missingAvailableDate.length;
  const park=(reasonCode:string,naturalKey:string,payload:Record<string,unknown>)=>quarantine(tables,{dataset,table:'financial_facts',naturalKey,reasonCode,batchId,payload:{...payload,run_id:runId}});
  // Parser leftovers come FIRST (round-1 #9): they need no filing row, and an input whose rows all
  // lack an available date must still leave its missing_available_date evidence behind even though
  // the empty-result branch below publishes an empty run. Parser-level ambiguity: the adapter's
  // `key` is its own grouping string (it knows no issuer); the §7.1 natural key is rendered here
  // from the first candidate and the parser key kept in the payload.
  // One item per natural key (round-5): quarantine() returns the existing open item without touching its
  // payload, so rows sharing a key are grouped here and their evidence lands together in `rows`.
  // Counts stay per row.
  const grouped=<T,>(items:T[],keyOf2:(x:T)=>string)=>{const m=new Map<string,T[]>();for(const x of items){const k=keyOf2(x);const g=m.get(k);if(g)g.push(x);else m.set(k,[x]);}return m;};
  const ambiguousRows=parsed.ambiguous.flatMap(a=>a.candidates.map(c=>({c,parserKey:a.key}))).filter(x=>x.c!==undefined);
  for(const [naturalKey,rows] of grouped(ambiguousRows,x=>ambiguousKey(issuer,market,keyOfCandidate(x.c),x.c.filingRef,gen))){
   const c0=rows[0].c;
   await park('ambiguous_value',naturalKey,{key:keyComponents(issuer,market,keyOfCandidate(c0)),parser_key:rows[0].parserKey,candidates:rows.map(x=>x.c),rows:rows.map(x=>x.c)});out.counts.quarantined+=rows.length;
  }
  for(const [naturalKey,rows] of grouped(parsed.oddDuration,c=>ambiguousKey(issuer,market,keyOfCandidate(c),c.filingRef,gen))){
   await park('odd_duration',naturalKey,{key:keyComponents(issuer,market,keyOfCandidate(rows[0])),candidate:rows[0],rows});out.counts.quarantined+=rows.length;
  }
  for(const [naturalKey,rows] of grouped(parsed.missingAvailableDate,r=>missingDateKey(issuer,scope.fetch_key,r))){
   await park('missing_available_date',naturalKey,{row:rows[0],rows});out.counts.quarantined+=rows.length;
  }
  // Adapter summaries → the batch info channel (round-1 #12): skip counters always, CN coverage when wired.
  if(parsed.skipped.length>0)out.errors.push(skippedSummary(issuer,parsed.skipped));
  if(market==='CN'&&deps.coverageCn)out.errors.push({code:'coverage_summary',key:issuer,message:compactCoverage(deps.coverageCn(parsed))});
  if(parsed.filings.length===0&&parsed.candidates.length===0){
   await phase(PUBLISH_MIN_MS);
   await db.publishRun(runId,[]);publishedRun=true;await releaseOnce('success');out.outcome='published';return skip('no_rows');
  }
  await phase();
  const staged=await stageFilings(db,runId,issuer,market,parsed);
  const filingCandidates=parsed.filings.map(f=>({...f,availableDate:staged.filingRows.get(staged.filingIds.get(f.sourceRef)??'')!.available_date}));
  await phase();
  const read=await db.readFacts(issuer,market,{concepts:ALL_CONCEPTS,asOf:isoDate(deps.now()),history:true,includeNonOk:true});
  if(read.truncated){await cleanup('failed');return fail('read_truncated');}
  const open=await db.openConflicts(issuer,market);
  const plan=planFactWrites({existing:read.rows,openConflicts:open,candidates:parsed.candidates,filingCandidates,filings:staged.filingIds,issuerId:issuer,market,mappingGen:gen,mappingVersion:MAPPING_VERSION});
  await phase();
  if(plan.inserts.length>0)await db.stageFacts(runId,plan.inserts);
  await phase();
  for(const a of plan.ambiguous)await park('ambiguous_value',a.naturalKey,{key:a.key,candidates:a.candidates});
  for(const c of plan.conflicts){
   const itemId=await park('same_day_conflict',c.naturalKey,{key:c.key,fact_ids:[...c.newFactIds,...c.existingOkFactIds],values:c.values});
   await db.quarantineFacts(runId,c.newFactIds,itemId);
  }
  for(const j of plan.contestedJoins)await db.quarantineFacts(runId,j.factIds,j.itemId);
  const parked=new Set(plan.quarantinedFactIds);
  const sourceRefOf=new Map([...staged.filingRows.values()].map(f=>[f.filing_id,f.source_ref]));
  const rules=evaluateFactRules({newRows:plan.inserts.filter(r=>!parked.has(r.fact_id)),okRows:read.rows.filter(r=>r.status==='ok'),sourceRefOf,issuerId:issuer,market,mappingGen:gen});
  await phase();
  for(const rq of rules.quarantine){
   const itemId=await park(rq.reason,rq.naturalKey,{key:rq.key,fact_ids:rq.factIds,rule:rq.rule,detail:rq.detail});
   await db.quarantineFacts(runId,rq.factIds,itemId);
   for(const id of rq.factIds)plan.outcomes.set(id,'quarantined');
  }
  out.warnings=rules.warnings;
  // Ambiguous items are evidence without fact rows: they survive an abandoned run and count now.
  // Everything backed by staged fact rows (inserted / versioned / duplicates / parked rows) is only
  // committed by publishRun; an abandon deletes those rows, so their counts are applied after it (round-3 #4).
  out.counts.quarantined+=plan.ambiguous.reduce((n,a)=>n+a.candidates.length,0);
  const committed=emptyCounts();
  for(const o of plan.outcomes.values())committed[o]++;
  committed.duplicates=plan.counts.duplicates;
  const manifest=parsed.filings.map(f=>staged.filingIds.get(f.sourceRef)!);
  await phase(PUBLISH_MIN_MS);
  try{await db.publishRun(runId,manifest,read.stateRev);}
  catch(e){const c=dbCode(e);if(c!=='mapping_gen_regression'&&c!=='stale_plan')throw e;await cleanup('failed',{delayMs:c==='stale_plan'?NEXT_DUE_STALE_MS:undefined});return fail(c);}
  publishedRun=true;
  out.outcome='published';
  for(const k of ['inserted','versioned','duplicates','quarantined'] as const)out.counts[k]+=committed[k];
  if(market==='CN'&&deps.linkCn)await linkFilings(deps,issuer,market,budget,out,renewIfNeeded);
  if(budget.signal.aborted||budget.remainingMs()<=0)return afterPublish('deadline_hit',new Error('materialize_not_started'));
  await renewIfNeeded();
  try{await materialize(db,issuer,market);}
  catch(e){const code=dbCode(e);if(code!=='stale_computation'&&code!=='read_truncated')throw e;return afterPublish(code,e);}   // published stays; retried on the failure schedule
  // 9b (plan 3 §4.5): acceptance times; best-effort after publication — errors are recorded, the outcome stays published
  if(market==='US'&&deps.enrichAcceptance&&!budget.signal.aborted&&budget.remainingMs()>0){
   try{
    const a=await deps.enrichAcceptance(issuer,scope.fetch_key,budget);out.errors.push(...a.errors);out.acceptance=a.counts;
    if(a.counts.failed>0)out.errors.push({code:'acceptance_failed',key:issuer,message:JSON.stringify({failed:a.counts.failed})});   // non-informational: the batch is partial, the issuer stays published
   }
   catch(e){out.errors.push({code:'acceptance_failed',key:issuer,message:errMsg(e)});}
  }
  await releaseOnce('success');
  return out;
 }catch(e){
  if(isLeaseLoss(e)){leaseHeld=false;if(publishedRun){out.errors.push({code:'lease_lost',key:issuer});return out;}return fail('lease_lost');}
  if(isDeadline(e,budget)){
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

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find . -name '*AGENTS*' -o -name CLAUDE.md; sed -n '65,135p' src/lib/facts/providers/sec-acceptance.ts; rg 'parsed.filings' src/lib/entities src/lib/dq -n; cat package.json" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 479ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>}
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

export async function enrichAcceptance(deps:AcceptanceDeps,issuer:{issuerId:string;cik10:string},budget:Budget):Promise<AcceptanceOutcome>{
 const out:AcceptanceOutcome={issuerId:issuer.issuerId,counts:emptyCounts(),errors:[],mismatches:[],snapshotSha256:null};
 const pending=(await deps.db.filingsOfIssuer(issuer.issuerId,'US',{})).filter(f=>f.source==='edgar'&&f.accepted_at===null);
 if(pending.length===0)return out;
 let snap:SubmissionsSnapshot;
 try{snap=await deps.submissions(issuer.cik10,budget,acceptanceCoverFrom(pending));}
 catch(e){out.errors.push({code:'sec_unavailable',key:issuer.issuerId,message:(e instanceof Error?e.message:String(e)).slice(0,200)});return out;}
 out.snapshotSha256=snap.main.sha256;
 const {index,ambiguous}=acceptanceIndex(snap.parsed.filings);
 const cik=issuer.cik10.replace(/^0+(?=\d)/,'');
 const amb=new Set(ambiguous);
 let notFound=0,unrecorded=0,ambiguousHit=0;
 for(let i=0;i<pending.length;i++){
  const f=pending[i];
  if(budget.signal.aborted||budget.remainingMs()<=0){
   out.errors.push({code:'deadline_hit',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify({remaining:pending.length-i})});break;
  }
  if(amb.has(f.source_ref)){out.counts.fetched++;out.counts.failed++;ambiguousHit++;continue;}   // conflicting copies: never guess
  const e=index.get(f.source_ref);
  if(!e){notFound++;continue;}
  out.counts.fetched++;
  if(e.filingDate!==f.available_date){
   const r=filingDateMismatch(cik,f,e,pageSha256(snap,e.page));out.mismatches.push(r);out.counts.failed++;
   if(deps.recordDateMismatch){
    try{await deps.recordDateMismatch(r);}
    catch(err){out.errors.push({code:'reconcile_record_failed',key:f.source_ref,message:(err instanceof Error?err.message:String(err)).slice(0,200)});}
   }else unrecorded++;
   continue;
  }
  if(e.acceptedAt===null){out.counts.fetched--;notFound++;continue;}
  try{if(await deps.db.setFilingAcceptance(f.filing_id,e.acceptedAt,ACCEPTANCE_SOURCE))out.counts.inserted++;else out.counts.duplicates++;}
  catch(err){
   if(!(err instanceof FactsDbError)||err.code!=='acceptance_conflict')throw err;
   out.counts.failed++;out.errors.push({code:'acceptance_conflict',key:f.source_ref});
  }
 }
 const summary:Record<string,number>={};
 if(notFound>0)summary.acceptance_not_found=notFound;
 if(ambiguousHit>0)summary.acceptance_ambiguous=ambiguousHit;
 if(unrecorded>0)summary.filing_date_mismatch_unrecorded=unrecorded;
 if(Object.keys(summary).length>0)out.errors.push({code:'skipped_summary',key:`${issuer.issuerId}:acceptance`,message:JSON.stringify(summary)});
 return out;
}
src/lib/entities/identifiers/sec-submissions.test.ts:88:  expect(s.parsed.filings).toHaveLength(3);
src/lib/entities/identifiers/sec-submissions.test.ts:98:  expect(s.parsed.filings.map(f=>f.form)).toEqual(['10-Q','25-NSE','10-K','10-Q','8-A12B']);
src/lib/entities/identifiers/sec-submissions.ts:162:   const filings=[...parsed.filings];
src/lib/entities/identifiers/sec-submissions.ts:171:   return {cik:c,fetchedAt,main:main.doc,pages,parsed:{...parsed,filings},complete:wanted.length===parsed.files.length};
src/lib/entities/identifiers/sec-submissions.ts:177:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
src/lib/entities/identifiers/sec-submissions.ts:189: return snap.parsed.filings.flatMap(f=>{
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
/bin/zsh -lc "sed -n '175,240p' src/lib/entities/identifiers/sec-submissions.ts; rg 'filingsByAccession|submission.*Events|submissionsEvents' src scripts; sed -n '1,130p' src/lib/facts/providers/sec-acceptance.test.ts; rg 'filingsByAccession' -n . --glob '"'!package-lock.json'"'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:

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
src/lib/entities/identifiers/sec-submissions.test.ts: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
src/lib/entities/identifiers/sec-submissions.test.ts:  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
src/lib/entities/identifiers/sec-submissions.ts:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
// src/lib/facts/providers/sec-acceptance.test.ts
import {describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {SubmissionFiling,SubmissionsSnapshot} from '../../entities/identifiers/sec-submissions';
import {filingInsert} from '../db-contract';
import {memoryFactsDb} from '../memory-facts-db';
import {FactsDbError} from '../types';
import type {Budget} from '../types';
import {memoryRawStore} from '../../dq/raw-store';
import {createPacer} from './shared';
import {SEC_MIN_INTERVAL_MS,fetchSubmissions} from '../../entities/identifiers/sec-submissions';
import {acceptanceIndex,enrichAcceptance,parseAcceptanceDateTime} from './sec-acceptance';

const budget:Budget={remainingMs:()=>60_000,signal:new AbortController().signal};
type Entry=SubmissionFiling;
const entry=(accessionNumber:string,filingDate:string,acceptanceDateTime:string|null,form='10-Q',page='recent'):Entry=>({accessionNumber,filingDate,reportDate:'2023-12-31',acceptanceDateTime,form,primaryDocument:'d.htm',isInlineXBRL:true,page});
// Task 6a shape: SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:{…, filings}, complete}
const PAGE1='CIK0000320193-submissions-001.json';
const snapshot=(recent:Entry[],pages:{name:string;sha256:string}[]=[]):SubmissionsSnapshot=>({cik:'320193',fetchedAt:'2026-11-05T00:00:00.000Z',main:{name:'main',sha256:'a'.repeat(64),path:`sec-submissions/${'a'.repeat(64)}.json`},
 pages:pages.map(x=>({...x,path:`sec-submissions/${x.sha256}.json`})),parsed:{filings:recent},complete:true} as unknown as SubmissionsSnapshot);

describe('parseAcceptanceDateTime',()=>{
 it('accepts SEC UTC timestamps and refuses everything else (missing stays missing)',()=>{
  expect(parseAcceptanceDateTime('2026-09-18T00:53:51.000Z')).toBe('2026-09-18T00:53:51.000Z');
  expect(parseAcceptanceDateTime('2024-02-01T21:05:00Z')).toBe('2024-02-01T21:05:00.000Z');
  for(const v of [null,'',' 2024-02-01T21:05:00Z','2024-02-01 21:05:00','2024-02-01T21:05:00+01:00','2024-02-30T10:00:00.000Z','20240201',42])expect(parseAcceptanceDateTime(v)).toBeNull();
 });
});

describe('acceptanceIndex',()=>{
 it('indexes by accessionNumber; a repeated accession with the same values is kept, a disagreeing one is ambiguous and left out',()=>{
  const {index,ambiguous}=acceptanceIndex([entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('A','2024-02-01','2024-02-01T21:05:00.000Z'),entry('B','2024-03-01','2024-03-01T10:00:00.000Z'),entry('B','2024-03-02','2024-03-01T10:00:00.000Z'),entry('C','2024-04-01',null)]);
  expect(index.get('A')).toEqual({accessionNumber:'A',filingDate:'2024-02-01',form:'10-Q',acceptedAt:'2024-02-01T21:05:00.000Z',page:'recent'});
  expect(index.has('B')).toBe(false);expect(ambiguous).toEqual(['B']);
  expect(index.get('C')!.acceptedAt).toBeNull();
 });
});

async function seeded(){
 const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
 await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:'0000320193'}]);await db.claimLease(iss,'US',b,600);
 const run=await db.beginRun(iss,'US',b,1);
 const f=(ref:string,availableDate:string)=>filingInsert(iss,{sourceRef:ref,availableDate});
 const ok=f('0000320193-24-000001','2024-02-01'),mismatch=f('0000320193-24-000002','2024-05-02'),absent=f('0000320193-24-000003','2024-08-02'),noTime=f('0000320193-24-000004','2024-11-01');
 await db.stageFilings(run,[ok,mismatch,absent,noTime]);await db.publishRun(run,[ok,mismatch,absent,noTime].map(x=>x.filing_id));
 const snap=snapshot([entry(ok.sourceRef,'2024-02-01','2024-02-01T21:05:00.000Z'),entry(mismatch.sourceRef,'2024-05-01','2024-05-01T20:00:00.000Z'),entry(noTime.sourceRef,'2024-11-01',null)]);
 return {db,iss,ok,mismatch,absent,noTime,snap};
}

describe('enrichAcceptance (spec §4.5)',()=>{
 it('writes acceptance for matching filings; a filingDate ≠ available_date becomes a sec.filing_date_vs_submissions result and no write; unknown or time-less accessions are skipped_summary',async()=>{
  const {db,iss,ok,mismatch,snap}=await seeded();
  const record=vi.fn(async(_r:unknown)=>{});
  const submissions=vi.fn(async(_c:string,_b:Budget,_coverFrom:string)=>snap);
  const out=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
  expect(submissions).toHaveBeenCalledWith('0000320193',budget,'2024-01-25');   // coverFrom = earliest pending available_date − 7 days (plan audit R3)
  expect(out.counts).toMatchObject({fetched:2,inserted:1,duplicates:0,failed:1});
  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2})}]);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record.mock.calls[0][0]).toEqual({natural_key:`320193:${mismatch.sourceRef}`,kind:'date',outcome:'compared',passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',
   left_source:'filings.available_date',right_source:'sec_submissions.filingDate',action:'record',
   detail:{left_text:'2024-05-02',right_text:'2024-05-01',left:{filing_id:mismatch.filing_id,source_ref:mismatch.sourceRef},right:{document:'submissions',sha256:'a'.repeat(64),locator:`filings.recent[accessionNumber=${mismatch.sourceRef}]`}}});
  expect((await db.findFilingBySourceRef('edgar',ok.sourceRef))!.accepted_at).toBe('2024-02-01T21:05:00.000Z');
  expect((await db.findFilingBySourceRef('edgar',mismatch.sourceRef))!.accepted_at).toBeNull();
  // second pass: the accepted filing is no longer pending; the mismatch is reported again
  const again=await enrichAcceptance({db,submissions,recordDateMismatch:record},{issuerId:iss,cik10:'0000320193'},budget);
  expect(again.counts).toMatchObject({fetched:1,inserted:0,failed:1});
  expect(submissions.mock.calls[1][2]).toBe('2024-04-25');                       // the accepted 2024-02-01 filing no longer widens the window
 });
 it('a pending accession listed only in a historical files[] page is fetched through coverFrom and written; a mismatch there cites that page and its hash (plan audit R3)',async()=>{
  const {db,iss,absent,noTime}=await seeded();
  const histSha='e'.repeat(64);
  const withPage=snapshot([entry(noTime.sourceRef,'2024-11-01',null)],[{name:PAGE1,sha256:histSha}]);
  (withPage.parsed.filings as Entry[]).push(entry(absent.sourceRef,'2024-08-02','2024-08-02T20:30:00.000Z','10-Q',PAGE1));
  const mainOnly=snapshot([entry(noTime.sourceRef,'2024-11-01',null)]);
  // the stub answers like fetchSubmissions: the historical page is included only when coverFrom reaches it
  const submissions=vi.fn(async(_c:string,_b:Budget,coverFrom:string)=>coverFrom<='2024-08-02'?withPage:mainOnly);
  const out=await enrichAcceptance({db,submissions,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(submissions.mock.calls[0][2]<='2024-08-02').toBe(true);
  expect((await db.findFilingBySourceRef('edgar',absent.sourceRef))!.accepted_at).toBe('2024-08-02T20:30:00.000Z');
  expect(out.counts).toMatchObject({inserted:1});
  // filingDate disagreeing on the historical page: the result points at PAGE1 and its sha256, not the main document
  const {db:db2,iss:iss2,absent:absent2}=await seeded();
  const moved=snapshot([],[{name:PAGE1,sha256:histSha}]);
  (moved.parsed.filings as Entry[]).push(entry(absent2.sourceRef,'2024-08-01','2024-08-01T20:30:00.000Z','10-Q',PAGE1));
  const record=vi.fn(async(_r:unknown)=>{});
  await enrichAcceptance({db:db2,submissions:async()=>moved,recordDateMismatch:record},{issuerId:iss2,cik10:'0000320193'},budget);
  expect(record.mock.calls[0][0]).toMatchObject({detail:{right:{document:PAGE1,sha256:histSha,locator:`${PAGE1}[accessionNumber=${absent2.sourceRef}]`}}});
 });
 it('without a recorder the mismatches are returned and the receipt says they were not recorded',async()=>{
  const {db,iss,snap}=await seeded();
  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.mismatches).toHaveLength(1);
  expect(out.errors).toEqual([{code:'skipped_summary',key:`${iss}:acceptance`,message:JSON.stringify({acceptance_not_found:2,filing_date_mismatch_unrecorded:1})}]);
 });
 it('acceptance_conflict counts as failed with its own error; the same value again is a duplicate; other errors are thrown',async()=>{
  const {db,iss,ok,snap}=await seeded();
  const conflicting={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new FactsDbError('acceptance_conflict');})};
  const out=await enrichAcceptance({db:conflicting,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.counts).toMatchObject({fetched:2,inserted:0,failed:2});
  expect(out.errors).toContainEqual({code:'acceptance_conflict',key:ok.sourceRef});
  const dup={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>false)};
  expect((await enrichAcceptance({db:dup,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).counts).toMatchObject({duplicates:1});
  const broken={filingsOfIssuer:db.filingsOfIssuer,setFilingAcceptance:vi.fn(async()=>{throw new Error('db down');})};
  await expect(enrichAcceptance({db:broken,submissions:async()=>snap,recordDateMismatch:async()=>{}},{issuerId:iss,cik10:'0000320193'},budget)).rejects.toThrow('db down');
 });
 it('submissions unavailable → sec_unavailable, nothing written; no pending filing → no fetch at all',async()=>{
  const {db,iss}=await seeded();
  const out=await enrichAcceptance({db,submissions:async()=>{throw new Error('404');}},{issuerId:iss,cik10:'0000320193'},budget);
  expect(out.counts).toMatchObject({fetched:0,inserted:0,failed:0});
  expect(out.errors).toEqual([{code:'sec_unavailable',key:iss,message:'404'}]);
  const none=vi.fn();
  expect((await enrichAcceptance({db,submissions:none},{issuerId:randomUUID(),cik10:'0000000001'},budget)).counts.fetched).toBe(0);
  expect(none).not.toHaveBeenCalled();
 });
});

describe('enrichAcceptance review fixes (Task 12 Codex)',()=>{
 const cik='0000320193';
 it('a time-less entry with a different filingDate is a mismatch first; with the same date it is acceptance_not_found',async()=>{
  const db=memoryFactsDb();const iss=randomUUID();const b=randomUUID();
  await db.reconcileScope('US',[{issuer_id:iss,reasons:[],priority:1,fetch_key:cik}]);await db.claimLease(iss,'US',b,600);
  const run=await db.beginRun(iss,'US',b,1);
  const a=filingInsert(iss,{sourceRef:'0000320193-24-000010',availableDate:'2024-02-01'}),c=filingInsert(iss,{sourceRef:'0000320193-24-000011',availableDate:'2024-03-01'});
  await db.stageFilings(run,[a,c]);await db.publishRun(run,[a.filing_id,c.filing_id]);
  const snap=snapshot([entry(a.sourceRef,'2024-02-02',null),entry(c.sourceRef,'2024-03-01','bad')]);
  const out=await enrichAcceptance({db,submissions:async()=>snap},{issuerId:iss,cik10:cik},budget);
  expect(out.mismatches).toHaveLength(1);expect(out.counts).toMatchObject({fetched:1,failed:1,inserted:0});
  expect(out.errors[0].message).toContain('"acceptance_not_found":1');
 });
./src/lib/entities/identifiers/sec-submissions.test.ts:10: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./src/lib/entities/identifiers/sec-submissions.test.ts:99:  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
./src/lib/entities/identifiers/sec-submissions.ts:177:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/12-review-fix1.md:1224:src/lib/entities/identifiers/sec-submissions.ts:177:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/12-review.md:1071:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md:629:+ SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md:704:+  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md:910:+export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review.md:2064:4127:| `src/lib/entities/identifiers/sec-submissions.ts`（6a；**Task 12、18 复用的稳定 API**） | `SEC_SUBMISSIONS_BASE`、`SEC_MIN_INTERVAL_MS=120`、`SUBMISSIONS_PARSER_VERSION='sec-submissions/1'`、`submissionsUrl(cik)`、`SubmissionFiling`、`SubmissionsPageRef`、`FormerName`、`ParsedSubmissions`、`StoredDoc`、`SubmissionsSnapshot`、`SecSubmissionsError{code:'sec_unavailable'|'invalid_schema'}`、`FilerAcceleration`、`submissionsCategory(raw)`、`parseSubmissions(json)`、`parseSubmissionsPage(json,name)`、`FetchSubmissionsDeps`、`submissionsClient(deps)`（`.fetch(cik,{coverFrom})`，同一客户端内 120 ms 间隔）、`fetchSubmissions(cik,deps,opts)`、`filingsByAccession(parsed)`、`EVIDENCE_FORMS`、`submissionsEvidenceClaims(issuerId,snapshot,asOf)` | 见 Task 6a 末尾"对 Task 12/18 的接口说明" |
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md:414:  SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md:774:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix1.md:1142:src/lib/entities/identifiers/sec-submissions.test.ts:9: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./docs/audits/2026-11-05-data-foundation-3/codex/6b-review.md:1658:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix2.md:489:  SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix2.md:1198:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/audits/2026-11-05-data-foundation-3/codex/6a-review-fix2.md:1213:src/lib/entities/identifiers/sec-submissions.ts:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:4127:| `src/lib/entities/identifiers/sec-submissions.ts`（6a；**Task 12、18 复用的稳定 API**） | `SEC_SUBMISSIONS_BASE`、`SEC_MIN_INTERVAL_MS=120`、`SUBMISSIONS_PARSER_VERSION='sec-submissions/1'`、`submissionsUrl(cik)`、`SubmissionFiling`、`SubmissionsPageRef`、`FormerName`、`ParsedSubmissions`、`StoredDoc`、`SubmissionsSnapshot`、`SecSubmissionsError{code:'sec_unavailable'|'invalid_schema'}`、`FilerAcceleration`、`submissionsCategory(raw)`、`parseSubmissions(json)`、`parseSubmissionsPage(json,name)`、`FetchSubmissionsDeps`、`submissionsClient(deps)`（`.fetch(cik,{coverFrom})`，同一客户端内 120 ms 间隔）、`fetchSubmissions(cik,deps,opts)`、`filingsByAccession(parsed)`、`EVIDENCE_FORMS`、`submissionsEvidenceClaims(issuerId,snapshot,asOf)` | 见 Task 6a 末尾"对 Task 12/18 的接口说明" |
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6835:**对 Task 12（受理时刻）、Task 18（日历）的接口说明**（本任务交付后不得改签名）：`submissionsClient(deps).fetch(cik,{coverFrom})` 在同一客户端内保持 ≥ 120 ms 间隔；`coverFrom=null|undefined` 只抓主文档，`coverFrom='YYYY-MM-DD'` 再抓所有 `filingTo >= coverFrom` 的分页；返回 `SubmissionsSnapshot{cik, fetchedAt, main:{name:'main',sha256,path}, pages:StoredDoc[], parsed:ParsedSubmissions, complete}`，`parsed.filings` 是 `recent` ∪ 已抓分页（按 `accessionNumber` 去重，`page` 字段指明出处：`'recent'` 或分页文件名），`complete` 表示 `files[]` 全部已抓。`filingsByAccession(parsed)`；`submissionsCategory(raw)` 给 `category` 原文的加速类别（仅 SRC → `'unknown'`）；失败一律抛 `SecSubmissionsError`，`code ∈ {'sec_unavailable','invalid_schema'}`。
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6891: SEC_MIN_INTERVAL_MS,SecSubmissionsError,fetchSubmissions,filingsByAccession,parseSubmissions,parseSubmissionsPage,
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:6966:  expect(filingsByAccession(s.parsed).get('0000999001-01-000001')?.page).toBe('CIK0000999001-submissions-001.json');
./docs/superpowers/plans/2026-11-05-data-foundation-3-identifiers-and-reconciliation.md:7189:export const filingsByAccession=(parsed:ParsedSubmissions)=>new Map(parsed.filings.map(f=>[f.accessionNumber,f] as const));

codex
No actionable regressions were identified in the commit. The changes consistently handle conflicting submissions, prioritize date mismatches, stop enrichment when the budget expires, and expose acceptance failures in sync receipts. Tests were inspected but not executed.
No actionable regressions were identified in the commit. The changes consistently handle conflicting submissions, prioritize date mismatches, stop enrichment when the budget expires, and expose acceptance failures in sync receipts. Tests were inspected but not executed.

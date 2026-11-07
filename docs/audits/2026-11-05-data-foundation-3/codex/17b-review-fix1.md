OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b15d-7b49-7d32-a0be-f46a01b80079
--------
user
commit 1d342ea
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1d342ea; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1426ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-8IamONFk' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oLMzYf9F' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-yFNZCUEd' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fSv8oK4V' (errno=Operation not permitted)
1d342ea8 fix(dq): filer-categories review fixes (streamed 50 MB cap, per-document isolation, honest freshness, shared classifier)
 src/lib/dq/filer-categories.test.ts   | 71 +++++++++++++++++++++++++++++++++++
 src/lib/dq/filer-categories.ts        | 71 +++++++++++++++++++++--------------
 src/lib/dq/reconcile/pair-us-ixbrl.ts |  2 +-
 3 files changed, 114 insertions(+), 30 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then echo ==== $p; cat "$p"; fi; done; ls -a | head -30; git show 1d342ea --; find . -iname '"'*agents*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: === not found

exec
/bin/zsh -lc 'for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if [ -f "$p" ]; then printf '"'\\n%s\\n' \""'$p"; cat "$p"; fi; done; git show 1d342ea --; find . -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 115ms:

/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ytD6lhDw' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BPC9rLNP' (errno=Operation not permitted)
commit 1d342ea86b06ad69fc75bd839c64e155e70baa4d
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:57:20 2026 -0800

    fix(dq): filer-categories review fixes (streamed 50 MB cap, per-document isolation, honest freshness, shared classifier)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/filer-categories.test.ts b/src/lib/dq/filer-categories.test.ts
index 57a4f656..d4e24b51 100644
--- a/src/lib/dq/filer-categories.test.ts
+++ b/src/lib/dq/filer-categories.test.ts
@@ -7,6 +7,8 @@ import {coverOf,latestTenKs,parseFilerCategory,submissionsView,syncFilerCategori
 import type {SubmissionsView} from './filer-categories';
 import {memoryRawStore} from './raw-store';
 import type {Budget,FactsDb,ScopeRow} from '../facts/types';
+import {fetchSecDocument,FilerCategoryError} from './filer-categories';
+import {secPacer} from '../facts/providers/shared';
 
 const ISSUER='00000000-0000-4000-8000-0000000000f1';
 const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
@@ -119,3 +121,72 @@ describe('syncFilerCategories',()=>{
     {accessionNumber:'b',filingDate:'2025-05-01',reportDate:null,form:'10-Q',primaryDocument:'',isInlineXBRL:false}]});
  });
 });
+
+describe('review fixes: isolation, freshness, caps',()=>{
+ const scope:ScopeRow={issuer_id:ISSUER,market:'US',reasons:['t'],priority:10,fetch_key:'0000000001',next_due_at:'2026-01-01T00:00:00Z',lease_until:null,lease_batch_id:null,state_rev:0,last_attempt_at:null,last_success_at:null,last_batch_id:null,last_status:null};
+ const v=(entries:SubmissionsView['entries']):SubmissionsView=>({cik10:'0000000001',sha256:'s',category:null,fiscalYearEnd:'1231',entries});
+ const mk=(docs:Record<string,string>,view:SubmissionsView,b:Budget=budget())=>{
+  const tables=memoryTableClient({issuer_filer_categories:['issuer_id','fiscal_year'],dq_freshness:['dataset'],ingest_batches:['batch_id']});
+  const deps={tables,raw:memoryRawStore(),db:{scopeAll:async()=>[scope]} as Pick<FactsDb,'scopeAll'>,submissions:async()=>view,
+   fetchDocument:async(url:string)=>{const d=docs[url.split('/').at(-1)!];if(d===undefined)throw new Error('404');return new TextEncoder().encode(d);},
+   now:()=>new Date('2026-11-05T03:00:00Z'),budget:b,codeVersion:'c'.repeat(40)};
+  return {deps,tables};
+ };
+ const opts={limit:25,dryRun:false,triggeredBy:'script' as const};
+ it('a malformed document fails alone; the next valid one lands and the batch is finished',async()=>{
+  const {deps,tables}=mk({'a1.htm':'<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><ix:nonNumeric name="dei:EntityFilerCategory"','a2.htm':cover('Accelerated Filer','2023-12-31')},v([entry('a1','2025-02-20','2024-12-31'),entry('a2','2024-02-20','2023-12-31')]));
+  await syncFilerCategories(deps,opts);
+  expect(tables.rows('issuer_filer_categories').map(s=>s.accession)).toEqual(['a2']);
+  expect(tables.rows('ingest_batches')[0].finished_at).toBeTruthy();
+  expect(tables.rows('dq_freshness')).toHaveLength(1);
+ });
+ it('a failing write is that document failure and the batch still finishes',async()=>{
+  const {deps,tables}=mk({'a1.htm':cover('Accelerated Filer')},v([entry('a1','2025-02-20','2024-12-31')]));
+  const up=tables.upsert.bind(tables);tables.upsert=async(t,row,k)=>{if(t==='issuer_filer_categories')throw new Error('db down');return up(t,row,k);};
+  const r=await syncFilerCategories(deps,opts);
+  expect(r.counts.failed).toBe(1);expect(r.errors).toContainEqual({code:'write_failed',key:`${ISSUER}:a1`});
+  expect(tables.rows('ingest_batches')[0].finished_at).toBeTruthy();
+  expect(tables.rows('dq_freshness')[0].status).not.toBe('fresh');
+ });
+ it('zero budget processes nobody and does not mark the dataset fresh',async()=>{
+  const {deps,tables}=mk({},v([]),{remainingMs:()=>0,signal:new AbortController().signal});
+  const r=await syncFilerCategories(deps,opts);
+  expect(r.errors[0].code).toBe('deadline_hit');
+  expect(tables.rows('dq_freshness').every(f=>f.status!=='fresh')).toBe(true);
+ });
+ it('stores smaller_reporting:true when the cover says so',async()=>{
+  const {deps,tables}=mk({'a1.htm':cover('Non-accelerated Filer Smaller Reporting Company')},v([entry('a1','2025-02-20','2024-12-31')]));
+  await syncFilerCategories(deps,opts);
+  expect(tables.rows('issuer_filer_categories')[0]).toMatchObject({acceleration:'non_accelerated',smaller_reporting:true});
+ });
+ it('two 10-Ks of the same fiscal year: the newer one wins, the older is skipped',async()=>{
+  const {deps,tables}=mk({'n.htm':cover('Accelerated Filer','2024-12-31'),'o.htm':cover('Large Accelerated Filer','2024-12-31')},v([entry('o','2025-01-10','2024-12-31'),entry('n','2025-02-20','2024-12-31')]));
+  const r=await syncFilerCategories(deps,opts);
+  expect(tables.rows('issuer_filer_categories').map(s=>s.accession)).toEqual(['n']);
+  expect(r.errors).toContainEqual({code:'skipped_summary',key:'filer-categories',message:JSON.stringify({fiscal_year_duplicate:1})});
+ });
+});
+
+describe('fetchSecDocument',()=>{
+ const b=budget();
+ const run=(f:()=>Response)=>{secPacer.reset();return fetchSecDocument('https://www.sec.gov/x.htm',b,{fetch:(async()=>f()) as typeof fetch});};
+ it('returns the bytes',async()=>{expect(new TextDecoder().decode(await run(()=>new Response('hello')))).toBe('hello');});
+ it('rejects a declared length over the cap; a non-numeric content-length is not trusted',async()=>{
+  await expect(run(()=>new Response('x',{headers:{'content-length':String(60*1024*1024)}}))).rejects.toMatchObject({code:'document_too_large'});
+  expect(new TextDecoder().decode(await run(()=>new Response('ok',{headers:{'content-length':'abc'}})))).toBe('ok');
+ });
+ it('enforces the cap while streaming when no length is declared',async()=>{
+  const chunk=new Uint8Array(8*1024*1024);let sent=0;
+  const stream=new ReadableStream<Uint8Array>({pull(c){if(sent++>=20)c.close();else c.enqueue(chunk);}});
+  await expect(run(()=>new Response(stream))).rejects.toMatchObject({code:'document_too_large'});
+  expect(sent).toBeLessThan(20);
+ });
+ it('maps HTTP errors and network failures to document_unavailable',async()=>{
+  await expect(run(()=>new Response('no',{status:404}))).rejects.toMatchObject({code:'document_unavailable',message:'http_404'});
+  await expect(run(()=>{throw new Error('boom');})).rejects.toBeInstanceOf(FilerCategoryError);
+ });
+ it('a rejected pacer admission is document_unavailable',async()=>{
+  secPacer.reset();
+  await expect(fetchSecDocument('https://www.sec.gov/x.htm',{remainingMs:()=>1000,signal:new AbortController().signal},{fetch:(async()=>new Response('x')) as typeof fetch})).rejects.toMatchObject({code:'document_unavailable',message:'budget_exhausted'});
+ });
+});
diff --git a/src/lib/dq/filer-categories.ts b/src/lib/dq/filer-categories.ts
index 7c9a79a2..a3b738c3 100644
--- a/src/lib/dq/filer-categories.ts
+++ b/src/lib/dq/filer-categories.ts
@@ -18,6 +18,7 @@ import type {RawStore} from './raw-store';
 import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
 import type {Acceleration,FilerCategoryRow} from './calendar';
 import {IXBRL_PARSER_VERSION,parseInlineXbrl} from './reconcile/ixbrl';
+import {filerClass,readLimited} from './reconcile/pair-us-ixbrl';
 import {recordReconciliation} from './reconcile/record';
 import {primaryDocumentUrl} from '../research/ingest/collectors/edgar';
 import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
@@ -39,12 +40,9 @@ export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
  * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
  */
 export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
- const t=raw.replace(/\s+/g,' ').trim().toLowerCase();
- const src=t.includes('smaller reporting')?true:null;
- if(/non-?\s?accelerated/.test(t))return {acceleration:'non_accelerated',smaller_reporting:src};
- if(t.includes('large accelerated'))return {acceleration:'large_accelerated',smaller_reporting:src};
- if(t.includes('accelerated filer'))return {acceleration:'accelerated',smaller_reporting:src};
- return null;
+ const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
+ if(acceleration===null)return null;
+ return {acceleration,smaller_reporting:raw.toLowerCase().includes('smaller reporting')?true:null};
 }
 const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
 /** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
@@ -73,10 +71,12 @@ export async function fetchSecDocument(url:string,budget:Budget,opts:DocumentFet
  try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'text/html'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});}
  catch{throw new FilerCategoryError('document_unavailable','network');}
  if(!res.ok)throw new FilerCategoryError('document_unavailable',`http_${res.status}`);
- if(Number(res.headers.get('content-length')??'0')>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
- const bytes=new Uint8Array(await res.arrayBuffer());
- if(bytes.byteLength>MAX_DOCUMENT_BYTES)throw new FilerCategoryError('document_too_large');
- return bytes;
+ const cl=res.headers.get('content-length');
+ if(cl!==null&&/^\d+$/.test(cl)&&Number(cl)>MAX_DOCUMENT_BYTES){await res.body?.cancel().catch(()=>undefined);throw new FilerCategoryError('document_too_large');}
+ let got:{bytes:Uint8Array;exceeded:boolean};
+ try{got=await readLimited(res,MAX_DOCUMENT_BYTES);}catch{throw new FilerCategoryError('document_unavailable','network');}   // capped while streaming; no unbounded arrayBuffer()
+ if(got.exceeded)throw new FilerCategoryError('document_too_large');
+ return got.bytes;
 }
 
 export interface FilerCategoryDeps{
@@ -97,8 +97,11 @@ export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCateg
  const counts=emptyCounts();const errors:BatchError[]=[];const rows:FilerCategoryRow[]=[];const recs:FilerCategoryReceipt['reconciliations']=[];
  const skipped:Record<string,number>={};const skip=(r:string)=>{skipped[r]=(skipped[r]??0)+1;};
  const batchId=opts.dryRun?null:(await startBatch(deps.tables,{producer:'filer-categories',dataset:DATASETS.filerCategories,toolVersions:{parser:IXBRL_PARSER_VERSION,rules:CALENDAR_RULES_VERSION},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy})).batchId;
+ let processed=0,incomplete=false,fatal:unknown=null;
+ try{
  for(const m of members){
-  if(deps.budget.remainingMs()<MIN_ISSUER_MS){errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-members.indexOf(m)})});break;}
+  if(deps.budget.remainingMs()<MIN_ISSUER_MS){incomplete=true;errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-processed})});break;}
+  processed++;
   let view:SubmissionsView;
   try{view=await deps.submissions(m.fetch_key,deps.budget);}
   catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
@@ -111,31 +114,41 @@ export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCateg
    catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
    try{sha256=(await deps.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{cik:view.cik10,accession:e.accessionNumber,document:e.primaryDocument}},deps.budget)).sha256;}
    catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
-   const cover=coverOf(new TextDecoder().decode(bytes));
-   if(i===0&&view.category!==null&&cover.category!==null){
-    const passed=norm(view.category)===norm(cover.category);
-    recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
-    if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
-     left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
-     detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
-   }
+   // One bad document never escapes the loop: a parse or write failure is that document's failure.
+   let cover:ReturnType<typeof coverOf>;
+   try{cover=coverOf(new TextDecoder().decode(bytes));}catch{fail('parse_error');continue;}
    const parsed=cover.category===null?null:parseFilerCategory(cover.category);
-   if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
    const periodEnd=e.reportDate&&ISO.test(e.reportDate)?e.reportDate:cover.periodEnd;
-   if(!periodEnd){skip('no_period_end');continue;}
-   const fiscalYear=fiscalYearOfPeriodEnd(periodEnd);
-   if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
-   seen.add(fiscalYear);
-   const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
-   rows.push(row);
-   if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
-   counts.fetched++;counts.inserted++;
+   const fiscalYear=parsed&&periodEnd?fiscalYearOfPeriodEnd(periodEnd):null;
+   try{
+    if(i===0&&view.category!==null&&cover.category!==null){
+     const passed=norm(view.category)===norm(cover.category);
+     if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
+      left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
+      detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
+     recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
+    }
+    if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
+    if(!periodEnd||fiscalYear===null){skip('no_period_end');continue;}
+    if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
+    const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
+    // Ordering limitation: issuer_filer_categories has no filing-date/accepted_at column (only as_of = run date) and TableClient.update
+    // matches on equality only, so a stale concurrent worker could overwrite a newer 10-K's row for the same fiscal year.
+    // Runs are serialised by cadence (event/script); a conditional write needs a schema change (reported, not done here).
+    if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
+    seen.add(fiscalYear);rows.push(row);
+    counts.fetched++;counts.inserted++;
+   }catch{fail('write_failed');}
   }
  }
+ }catch(e){fatal=e;errors.push({code:'unexpected',message:(e instanceof Error?e.message:String(e)).slice(0,200)});counts.failed++;}
  if(Object.keys(skipped).length)errors.push({code:'skipped_summary',key:'filer-categories',message:JSON.stringify(skipped)});
  if(!batchId)return {batchId:null,status:'dry_run',counts,errors,rows,reconciliations:recs};
+ // The receipt is always finalised once the batch exists (finishBatch + one freshness attempt), also after an unexpected error.
  const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
  const cadence=DQ_DATASET_INVENTORY.find(d=>d.dataset===DATASETS.filerCategories)!.cadence;
- await recordAttempt(deps.tables,DATASETS.filerCategories,{ok:status==='success',cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length}});
+ // Fresh only when every selected issuer was processed and nothing failed (incomplete coverage must not advance last_ok_at).
+ const ok=fatal===null&&!incomplete&&status==='success';
+ await recordAttempt(deps.tables,DATASETS.filerCategories,{ok,cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length,processed,incomplete}});
  return {batchId,status,counts,errors,rows,reconciliations:recs};
 }
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.ts b/src/lib/dq/reconcile/pair-us-ixbrl.ts
index 80687caa..4144d320 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.ts
@@ -54,7 +54,7 @@ const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStor
  * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
  * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
  */
-async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
+export async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
  if(!res.body){const all=new Uint8Array(await res.arrayBuffer());return all.byteLength>limit?{bytes:all.slice(0,limit),exceeded:true}:{bytes:all,exceeded:false};}
  const reader=res.body.getReader();const chunks:Uint8Array[]=[];let n=0;
  for(;;){

exec
/bin/zsh -lc "cat src/lib/dq/filer-categories.ts; sed -n '1,150p' src/lib/dq/reconcile/pair-us-ixbrl.ts; rg -n 'filerClass|fiscalYearOfPeriodEnd' src/lib/dq; cat src/lib/dq/batch.ts 2>/dev/null; ls -a | head -35" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// src/lib/dq/filer-categories.ts
// Per-fiscal-year filer categories from 10-K covers (spec §6.1 申报人类别, §3.1 issuer_filer_categories).
// For each in-scope US issuer: SEC submissions → its latest 3 original 10-Ks → each primary document
// (raw bytes into bucket reconcile-raw, sha256 = evidence_sha256) → the §5.2 inline-XBRL parser →
// dei:EntityFilerCategory → acceleration. Only-SRC / unparseable covers write no row (no usable
// category; the calendar then has no rule for that fiscal year). The latest 10-K's cover is also
// compared with submissions `category` as pair sec.filer_category (record.ts, kind text, record only).
// fiscal_year = calendar year of the month end nearest the 10-K's period end (calendar.ts
// fiscalYearOfPeriodEnd), the same label the calendar uses for its N−1 lookup.
import {PacerError,secPacer,sleep} from '../facts/providers/shared';
import type {Budget,FactsDb} from '../facts/types';
import type {TableClient} from '../db/table-client';
import {emptyCounts,finishBatch,startBatch} from './batches';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from './batches';
import {recordAttempt} from './freshness';
import {DATASETS,DQ_DATASET_INVENTORY} from './datasets';
import type {RawStore} from './raw-store';
import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
import type {Acceleration,FilerCategoryRow} from './calendar';
import {IXBRL_PARSER_VERSION,parseInlineXbrl} from './reconcile/ixbrl';
import {filerClass,readLimited} from './reconcile/pair-us-ixbrl';
import {recordReconciliation} from './reconcile/record';
import {primaryDocumentUrl} from '../research/ingest/collectors/edgar';
import {DEFAULT_USER_AGENT} from '../research/ingest/collectors/shared';
import type {SubmissionsSnapshot} from '../entities/identifiers/sec-submissions';

/** The submissions fields the calendar and this module read. Built only by submissionsView (one adaptation point to Task 6's snapshot). */
export interface SubmissionsEntryView{accessionNumber:string;filingDate:string;reportDate:string|null;form:string;primaryDocument:string;isInlineXBRL:boolean}
export interface SubmissionsView{cik10:string;sha256:string;category:string|null;fiscalYearEnd:string|null;entries:SubmissionsEntryView[]}
// Task 6a shape (Part B): SubmissionsSnapshot{cik, fetchedAt, main:StoredDoc, pages, parsed:ParsedSubmissions, complete};
// parsed.filings already merges recent with the fetched files[] pages; primaryDocument / isInlineXBRL may be null.
export function submissionsView(s:SubmissionsSnapshot):SubmissionsView{
 return {cik10:s.cik.padStart(10,'0'),sha256:s.main.sha256,category:s.parsed.category,fiscalYearEnd:s.parsed.fiscalYearEnd,
  entries:s.parsed.filings.map(e=>({accessionNumber:e.accessionNumber,filingDate:e.filingDate,reportDate:e.reportDate||null,form:e.form,primaryDocument:e.primaryDocument??'',isInlineXBRL:e.isInlineXBRL===true}))};
}

/**
 * Cover text → category. The non-accelerated test runs first because "Non-accelerated Filer" also
 * contains "accelerated filer" (spec §6.1 lists large → accelerated → non; same outcomes). Smaller
 * reporting status is only ever `true` (the words appear) or null (unknown) — never inferred false.
 */
export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
 const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
 if(acceleration===null)return null;
 return {acceleration,smaller_reporting:raw.toLowerCase().includes('smaller reporting')?true:null};
}
const norm=(s:string)=>s.replace(/\s+/g,' ').trim().toLowerCase();
/** Latest n original 10-Ks by filing date (amendments never: a 10-K/A cover restates, it does not determine status). */
export const latestTenKs=(v:SubmissionsView,n=3)=>v.entries.filter(e=>e.form==='10-K'&&e.primaryDocument!=='').sort((a,b)=>b.filingDate.localeCompare(a.filingDate)||b.accessionNumber.localeCompare(a.accessionNumber)).slice(0,n);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
/** dei values by local name; Task 13's parser keys nonNumeric by the canonical 'dei:<Local>' QName. */
export function coverOf(doc:string):{category:string|null;periodEnd:string|null}{
 const nn=parseInlineXbrl(doc).nonNumeric;
 const cat=nn['dei:EntityFilerCategory'];const pe=nn['dei:DocumentPeriodEndDate'];
 return {category:cat!==undefined&&cat.trim()!==''?cat.trim():null,periodEnd:pe!==undefined&&ISO.test(pe.trim())?pe.trim():null};
}

export const MAX_DOCUMENT_BYTES=50*1024*1024;
const RESERVE_MS=20_000;
// Shares THE process-wide SEC pacer (submissions, companyfacts, documents): the fair-access limit is per source address.
const pacer=secPacer;
export const resetDocumentPacing=()=>pacer.reset();
export class FilerCategoryError extends Error{constructor(public readonly code:'document_unavailable'|'document_too_large',message?:string){super(message??code);this.name='FilerCategoryError';}}
export interface DocumentFetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}
/** One SEC archive document (UA, 120 ms pacing, 60 s timeout, 50 MB cap). Thrown messages carry status codes only. */
export async function fetchSecDocument(url:string,budget:Budget,opts:DocumentFetchOptions={}):Promise<Uint8Array>{
 try{await pacer.admit({budget,reserveMs:RESERVE_MS,now:opts.now,sleep:opts.sleep});}catch(e){throw new FilerCategoryError('document_unavailable',e instanceof PacerError?e.code:'budget_aborted');}
 const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
 if(timeoutMs<=0)throw new FilerCategoryError('document_unavailable','budget_exhausted');
 let res:Response;
 try{res=await (opts.fetch??fetch)(url,{headers:{'User-Agent':opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'text/html'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});}
 catch{throw new FilerCategoryError('document_unavailable','network');}
 if(!res.ok)throw new FilerCategoryError('document_unavailable',`http_${res.status}`);
 const cl=res.headers.get('content-length');
 if(cl!==null&&/^\d+$/.test(cl)&&Number(cl)>MAX_DOCUMENT_BYTES){await res.body?.cancel().catch(()=>undefined);throw new FilerCategoryError('document_too_large');}
 let got:{bytes:Uint8Array;exceeded:boolean};
 try{got=await readLimited(res,MAX_DOCUMENT_BYTES);}catch{throw new FilerCategoryError('document_unavailable','network');}   // capped while streaming; no unbounded arrayBuffer()
 if(got.exceeded)throw new FilerCategoryError('document_too_large');
 return got.bytes;
}

export interface FilerCategoryDeps{
 tables:TableClient;db:Pick<FactsDb,'scopeAll'>;raw:RawStore;
 submissions:(cik10:string,b:Budget)=>Promise<SubmissionsView>;
 fetchDocument:(url:string,b:Budget)=>Promise<Uint8Array>;
 now:()=>Date;budget:Budget;codeVersion:string|null;
}
export interface FilerCategoryOptions{issuerIds?:string[];limit:number;dryRun:boolean;triggeredBy:TriggeredBy}
export interface FilerCategoryReceipt{batchId:string|null;status:BatchStatus|'dry_run';counts:BatchCounts;errors:BatchError[];rows:FilerCategoryRow[];reconciliations:{natural_key:string;passed:boolean}[]}
/** Stop starting issuers when less than this remains (one submissions + three documents). */
export const MIN_ISSUER_MS=30_000;

export async function syncFilerCategories(deps:FilerCategoryDeps,opts:FilerCategoryOptions):Promise<FilerCategoryReceipt>{
 const today=deps.now().toISOString().slice(0,10);
 const scope=(await deps.db.scopeAll('US')).filter(r=>opts.issuerIds?opts.issuerIds.includes(r.issuer_id):r.priority>0);
 const members=scope.sort((a,b)=>a.issuer_id.localeCompare(b.issuer_id)).slice(0,opts.issuerIds?undefined:opts.limit);
 const counts=emptyCounts();const errors:BatchError[]=[];const rows:FilerCategoryRow[]=[];const recs:FilerCategoryReceipt['reconciliations']=[];
 const skipped:Record<string,number>={};const skip=(r:string)=>{skipped[r]=(skipped[r]??0)+1;};
 const batchId=opts.dryRun?null:(await startBatch(deps.tables,{producer:'filer-categories',dataset:DATASETS.filerCategories,toolVersions:{parser:IXBRL_PARSER_VERSION,rules:CALENDAR_RULES_VERSION},codeVersion:deps.codeVersion??undefined,triggeredBy:opts.triggeredBy})).batchId;
 let processed=0,incomplete=false,fatal:unknown=null;
 try{
 for(const m of members){
  if(deps.budget.remainingMs()<MIN_ISSUER_MS){incomplete=true;errors.push({code:'deadline_hit',message:JSON.stringify({not_started:members.length-processed})});break;}
  processed++;
  let view:SubmissionsView;
  try{view=await deps.submissions(m.fetch_key,deps.budget);}
  catch(e){counts.fetched++;counts.failed++;errors.push({code:'sec_unavailable',key:m.issuer_id,message:(e as Error).message.slice(0,200)});continue;}
  const seen=new Set<number>();
  for(const [i,e] of latestTenKs(view).entries()){
   if(!e.isInlineXBRL){skip('not_inline_xbrl');continue;}
   const fail=(code:string)=>{counts.fetched++;counts.failed++;errors.push({code,key:`${m.issuer_id}:${e.accessionNumber}`});};
   let bytes:Uint8Array,sha256:string;
   try{bytes=await deps.fetchDocument(primaryDocumentUrl(view.cik10,e.accessionNumber,e.primaryDocument),deps.budget);}
   catch(err){fail(err instanceof FilerCategoryError?err.code:'document_unavailable');continue;}
   try{sha256=(await deps.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{cik:view.cik10,accession:e.accessionNumber,document:e.primaryDocument}},deps.budget)).sha256;}
   catch{fail('raw_upload_failed');continue;}   // no evidence in the bucket → no row depends on it (spec §3.1 bucket rule)
   // One bad document never escapes the loop: a parse or write failure is that document's failure.
   let cover:ReturnType<typeof coverOf>;
   try{cover=coverOf(new TextDecoder().decode(bytes));}catch{fail('parse_error');continue;}
   const parsed=cover.category===null?null:parseFilerCategory(cover.category);
   const periodEnd=e.reportDate&&ISO.test(e.reportDate)?e.reportDate:cover.periodEnd;
   const fiscalYear=parsed&&periodEnd?fiscalYearOfPeriodEnd(periodEnd):null;
   try{
    if(i===0&&view.category!==null&&cover.category!==null){
     const passed=norm(view.category)===norm(cover.category);
     if(batchId)await recordReconciliation(deps.tables,{pair:'sec.filer_category',batch_id:batchId,natural_key:`${view.cik10}:${e.accessionNumber}`,kind:'text',outcome:'compared',passed,
      left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',left_source:'sec_submissions.category',right_source:'ixbrl_dei.EntityFilerCategory',
      detail:{left_text:view.category,right_text:cover.category,left:{sha256:view.sha256},right:{document:e.primaryDocument,sha256}},action:'record'});
     recs.push({natural_key:`${view.cik10}:${e.accessionNumber}`,passed});
    }
    if(!parsed){skip(cover.category===null?'no_category':'category_unusable');continue;}
    if(!periodEnd||fiscalYear===null){skip('no_period_end');continue;}
    if(seen.has(fiscalYear)){skip('fiscal_year_duplicate');continue;}   // a newer 10-K already covers this fiscal year
    const row:FilerCategoryRow={issuer_id:m.issuer_id,fiscal_year:fiscalYear,acceleration:parsed.acceleration,smaller_reporting:parsed.smaller_reporting,category_raw:cover.category!,source:'ixbrl_dei',accession:e.accessionNumber,evidence_sha256:sha256,as_of:today};
    // Ordering limitation: issuer_filer_categories has no filing-date/accepted_at column (only as_of = run date) and TableClient.update
    // matches on equality only, so a stale concurrent worker could overwrite a newer 10-K's row for the same fiscal year.
    // Runs are serialised by cadence (event/script); a conditional write needs a schema change (reported, not done here).
    if(batchId)await deps.tables.upsert('issuer_filer_categories',{...row},'issuer_id,fiscal_year');
    seen.add(fiscalYear);rows.push(row);
    counts.fetched++;counts.inserted++;
   }catch{fail('write_failed');}
  }
 }
 }catch(e){fatal=e;errors.push({code:'unexpected',message:(e instanceof Error?e.message:String(e)).slice(0,200)});counts.failed++;}
 if(Object.keys(skipped).length)errors.push({code:'skipped_summary',key:'filer-categories',message:JSON.stringify(skipped)});
 if(!batchId)return {batchId:null,status:'dry_run',counts,errors,rows,reconciliations:recs};
 // The receipt is always finalised once the batch exists (finishBatch + one freshness attempt), also after an unexpected error.
 const status=await finishBatch(deps.tables,batchId,{counts,errors},deps.now());
 const cadence=DQ_DATASET_INVENTORY.find(d=>d.dataset===DATASETS.filerCategories)!.cadence;
 // Fresh only when every selected issuer was processed and nothing failed (incomplete coverage must not advance last_ok_at).
 const ok=fatal===null&&!incomplete&&status==='success';
 await recordAttempt(deps.tables,DATASETS.filerCategories,{ok,cadence,now:deps.now(),detail:{batch_id:batchId,rows:rows.length,issuers:members.length,processed,incomplete}});
 return {batchId,status,counts,errors,rows,reconciliations:recs};
}
// src/lib/dq/reconcile/pair-us-ixbrl.ts
// us.companyfacts_vs_ixbrl (spec §5.2, §5.3, T1). Members and expected keys come ONLY from the frozen sample
// manifest (US_SAMPLE_PATH). Per accession, in this order:
//  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
//  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 5xx retried twice then THROWN, 429 THROWN at once as sec_rate_limited = execution failure),
//     404 → unsupported(document_not_found), > 50 MB → unsupported(document_too_large); accepted bytes go to
//     reconcile-raw (content-addressed, sha256 = right_sha256) and are parsed; IxbrlParseError →
//     unsupported(parse_error:<code>); no ix element → unsupported(not_inline_xbrl);
//  3. left: read_filing_facts(filing, includeNonOk) filtered by activeRows (active generation, published,
//     ok|quarantined); an OPEN reconcile_mismatch item of the key pins its fact instead (explicit re-check,
//     any generation); 0 rows → left_missing, > 1 → left_ambiguous;
//  4. right match on the filer's facts (entity = CIK): the left row's source_concept in the same period and
//     unit, else the plan 2 fallback order (tagsOf) — first present tag, detail.tag_mismatch=true; none →
//     unsupported when the parser reported an unsupported fact of those tags for that period, else
//     right_missing; several distinct values → right_ambiguous (never quarantines);
//  5. exact comparison (tolerance 0: the iXBRL value is the filed value); action by actionFor (quarantine
//     only an ok left row, bound keys go back to their item). detail: left {fact_id, raw_hash, status,
//     precision null (value_text is canonicalised, trailing zeros are not retained)}, right {document, sha256, path, locator {name,
//     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
//     sha256, sample sha256, IXBRL_PARSER_VERSION).
// currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
// document fetched NOW and hashed; unobtainable (sample gone, not inline, 404, too large, SEC down) → null.
// sec.filer_category is NOT recorded here: its single producer is scripts/dq/filer-categories.ts (Task 17b,
// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
import {conceptById} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {secPacer,sleep} from '../../facts/providers/shared';
import {memoryRawStore} from '../raw-store';
import type {RawStore} from '../raw-store';
import type {FactRow} from '../../facts/types';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {compareDecimal} from './decimal';
import {computeInputsHash} from './inputs-hash';
import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument,IxFact} from './ixbrl';
import {ReconcileConfigError,runContextOf,actionFor,activeRows,comparedNumeric,factKeyOf,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
import type {RegisteredPair} from './pair-support';
import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
import type {SampleFiling,UsSample} from './us-sample';

const PAIR='us.companyfacts_vs_ixbrl' as const;
const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
const RESERVE_MS=10_000;

export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large';content_length:number|null;bytes_read:number};
/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
const FAILURE_BODY_CAP=1024*1024;
/** Dry runs never write production storage: evidence goes to an ephemeral in-memory store (hashes are still computed locally). */
const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStore():ctx.raw;
/**
 * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
 * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
 */
export async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
 if(!res.body){const all=new Uint8Array(await res.arrayBuffer());return all.byteLength>limit?{bytes:all.slice(0,limit),exceeded:true}:{bytes:all,exceeded:false};}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let n=0;
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  if(n+value.byteLength>limit){chunks.push(value.slice(0,limit-n));n=limit;await reader.cancel().catch(()=>undefined);return {bytes:concat(chunks,n),exceeded:true};}
  chunks.push(value);n+=value.byteLength;
 }
 return {bytes:concat(chunks,n),exceeded:false};
}
function concat(chunks:Uint8Array[],n:number):Uint8Array{const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}return out;}
/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped at 1 MB (truncated + flagged). */
async function storeFailure(ctx:PairContext,res:Response,url:string):Promise<void>{
 let got:{bytes:Uint8Array;exceeded:boolean};
 try{got=await readLimited(res,FAILURE_BODY_CAP);}catch{got={bytes:new Uint8Array(),exceeded:false};}
 await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure',...(got.exceeded?{truncated:1}:{})}},ctx.budget);
}
export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
 const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 for(let attempt=0;;attempt++){
  await secPacer.admit({budget:ctx.budget,reserveMs:RESERVE_MS});
  const timeout=Math.min(60_000,ctx.budget.remainingMs()-RESERVE_MS);
  if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
  const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
  if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
  if(res.status===429){await storeFailure(ctx,res,url);throw new Error('sec_rate_limited');}   // a run failure at once: no retry against a throttling SEC
  if(res.status>=500){
   await storeFailure(ctx,res,url);
   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
   throw new Error(`sec_unavailable:http_${res.status}`);
  }
  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
  const cl=res.headers.get('content-length'),declared=cl!==null&&/^\d+$/.test(cl)?Number(cl):null;
  if(declared!==null&&declared>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large',content_length:declared,bytes_read:0};}
  const got=await readLimited(res,MAX_IXBRL_BYTES);
  return got.exceeded?{status:'too_large',content_length:declared,bytes_read:got.bytes.byteLength}:{status:'ok',bytes:got.bytes};
 }
}

/** §6.1 categories, case-insensitive; 'non-accelerated' is tested before 'accelerated'; SRC alone or unparseable → null. */
export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
 if(!text)return null;
 const t=text.toLowerCase();
 if(t.includes('large accelerated'))return 'large_accelerated';
 if(t.includes('non-accelerated')||t.includes('non accelerated'))return 'non_accelerated';
 if(t.includes('accelerated filer'))return 'accelerated';
 return null;
}

async function loadSample(ctx:PairContext):Promise<{sample:UsSample;sha256:string}>{
 const {json,sha256}=await readRepoJson(ctx,US_SAMPLE_PATH,'invalid_sample_file');
 const v=validateUsSample(json);
 if(!v.ok)throw new ReconcileConfigError('invalid_sample_file',v.errors.slice(0,5).join('; '));
 return {sample:v.sample,sha256};
}

type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string;size?:{content_length:number|null;bytes_read:number}};
async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
 if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
 const got=await fetchSecDocument(f.doc_url,ctx);
 if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:'',...(got.status==='too_large'?{size:{content_length:got.content_length,bytes_read:got.bytes_read}}:{})};
 const stored=await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
 let doc:IxbrlDocument;
 try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
 catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
 if(doc.unsupported.some(u=>u.reason==='not_inline_xbrl'))return {kind:'unsupported',reason:'not_inline_xbrl',sha256:stored.sha256};
 const filer=doc.facts.filter(x=>entityIs(x.entity,cik)).map(x=>({...x,entity:'filer'}));
 return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
}

const withTagNote=<T extends {detail?:Record<string,unknown>}>(item:T,fallback:boolean):T=>fallback?{...item,detail:{...item.detail,tag_mismatch:true}}:item;
interface KeyLoc{cik:string;accn:string;concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:string}

export function usCompanyfactsVsIxbrlPair():RegisteredPair{
 return {
  id:PAIR,kind:'numeric',left:'edgar.companyfacts',right:'edgar.ixbrl',
  inputs:{repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA},
  async currentRight(ctx,rec){
   let sample:UsSample;
   try{sample=(await loadSample(ctx)).sample;}catch(e){if(e instanceof ReconcileConfigError)return null;throw e;}
   const nk=String(rec.natural_key);
   const entry=sample.issuers.flatMap(i=>i.filings.map(f=>({cik:i.cik,f}))).find(x=>x.f.expected_keys.some(k=>usNaturalKey(x.cik,x.f.accn,k)===nk))?.f;
   if(!entry||entry.is_inline_xbrl===false)return null;
   try{const got=await fetchSecDocument(entry.doc_url,ctx);return got.status==='ok'?sha256Hex(got.bytes):null;}
   catch(e){console.error('[reconcile] current right document',e instanceof Error?e.message:String(e));return null;}
  },
  async members(ctx){
   const {sample}=await loadSample(ctx);
   const out:MemberPlan[]=[];
   for(const iss of sample.issuers){
    const [row]=await ctx.tables.select('issuers',{cik:iss.cik},{limit:1});
    if(!row)throw new ReconcileConfigError('issuer_unresolved',`cik ${iss.cik}`);
    out.push({issuerId:String(row.issuer_id),market:'US',expectedKeys:iss.filings.flatMap(f=>f.expected_keys.map(k=>({naturalKey:usNaturalKey(iss.cik,f.accn,k),locator:{cik:iss.cik,accn:f.accn,concept:k.concept,period_start:k.period_start,period_end:k.period_end,unit:k.unit,source_concept:k.source_concept,origin:k.origin}})))});
src/lib/dq/calendar.ts:48:export const fiscalYearOfPeriodEnd=(periodEnd:string)=>+nearestMonthEnd(periodEnd).slice(0,4);
src/lib/dq/calendar.test.ts:3:import {SEC_HOLIDAYS,addMonthsAnchored,applicableCategory,computeExpectations,estimatePeriodEnd,filingsWindowStart,fiscalYearOfPeriodEnd,isSecBusinessDay,nearestMonthEnd,rollForward} from './calendar';
src/lib/dq/calendar.test.ts:51:  expect(fiscalYearOfPeriodEnd('2025-01-02')).toBe(2024);
src/lib/dq/calendar.test.ts:52:  expect(fiscalYearOfPeriodEnd('2025-09-27')).toBe(2025);
src/lib/dq/filer-categories.ts:9:// fiscalYearOfPeriodEnd), the same label the calendar uses for its N−1 lookup.
src/lib/dq/filer-categories.ts:18:import {CALENDAR_RULES_VERSION,fiscalYearOfPeriodEnd} from './calendar';
src/lib/dq/filer-categories.ts:21:import {filerClass,readLimited} from './reconcile/pair-us-ixbrl';
src/lib/dq/filer-categories.ts:43: const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
src/lib/dq/filer-categories.ts:122:   const fiscalYear=parsed&&periodEnd?fiscalYearOfPeriodEnd(periodEnd):null;
src/lib/dq/reconcile/us-sample-live.ts:16:import {filerClass} from './pair-us-ixbrl';
src/lib/dq/reconcile/us-sample-live.ts:92:  raw.push({ticker,cik,exchange:normalizeExchange(c.exchange??s.exchanges?.[0]),fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
src/lib/dq/reconcile/pair-us-ixbrl.ts:25:// spec §6.1; plan 3 接口对齐记录). filerClass stays exported for select-us-sample.ts.
src/lib/dq/reconcile/pair-us-ixbrl.ts:98:export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:11:import {fetchSecDocument,filerClass,usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:210: it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:211:  expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public

exec
/bin/zsh -lc "rg -n 'nonNumeric|textContent|replace\\(' src/lib/dq/reconcile/ixbrl.ts; sed -n '1,60p' src/lib/dq/filer-categories.test.ts; cat src/lib/dq/batches.ts | tail -65; sed -n '28,52p' src/lib/dq/calendar.ts; for d in .claude .claude/worktrees; do :; done; cat package.json | head -45; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
25://  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
40:export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
57: return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
158:  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
159:  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
216: const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
228:   if(f.local==='nonFraction'||f.local==='nonNumeric'){
261:   if(f.local==='nonFraction'||f.local==='nonNumeric'){
314: if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};
324:   const text=f.text.replace(/\s+/g,' ').trim();
325:   const prev=out.nonNumeric[name];
326:   if(prev===undefined)out.nonNumeric[name]=text;
327:   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
360:  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw===undefined?null:decimalsRaw.replace(/^\+/,''),scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
// src/lib/dq/filer-categories.test.ts
import {describe,expect,it} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {applicableCategory,computeExpectations} from './calendar';
import type {FilerCategoryRow} from './calendar';
import {coverOf,latestTenKs,parseFilerCategory,submissionsView,syncFilerCategories} from './filer-categories';
import type {SubmissionsView} from './filer-categories';
import {memoryRawStore} from './raw-store';
import type {Budget,FactsDb,ScopeRow} from '../facts/types';
import {fetchSecDocument,FilerCategoryError} from './filer-categories';
import {secPacer} from '../facts/providers/shared';

const ISSUER='00000000-0000-4000-8000-0000000000f1';
const budget=():Budget=>({remainingMs:()=>300_000,signal:new AbortController().signal});
/** Minimal inline-XBRL 10-K cover: namespaces declared, dei facts as ix:nonNumeric. */
const cover=(category:string|null,periodEnd='2024-12-31')=>`<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:xbrli="http://www.xbrl.org/2003/instance"><body>
<ix:header><ix:resources><xbrli:context id="c1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2024-01-01</xbrli:startDate><xbrli:endDate>${periodEnd}</xbrli:endDate></xbrli:period></xbrli:context></ix:resources></ix:header>
<p>Annual report for the fiscal year ended <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c1">${periodEnd}</ix:nonNumeric></p>
${category===null?'':`<p>Filer category: <ix:nonNumeric name="dei:EntityFilerCategory" contextRef="c1">${category}</ix:nonNumeric></p>`}
</body></html>`;
const entry=(accn:string,filingDate:string,reportDate:string,p:Partial<SubmissionsView['entries'][number]>={})=>({accessionNumber:accn,filingDate,reportDate,form:'10-K',primaryDocument:`${accn}.htm`,isInlineXBRL:true,...p});

describe('parseFilerCategory (dei:EntityFilerCategory cover text)',()=>{
 it.each([
  ['Large Accelerated Filer','large_accelerated',null],
  ['Large accelerated filer','large_accelerated',null],
  ['Accelerated Filer','accelerated',null],
  ['Non-accelerated Filer','non_accelerated',null],
  ['Non-Accelerated Filer','non_accelerated',null],
  ['Smaller Reporting Accelerated Filer','accelerated',true],
  ['Non-accelerated Filer  Smaller Reporting Company','non_accelerated',true],
 ])('%s → %s (SRC %s)',(raw,acceleration,src)=>{expect(parseFilerCategory(raw)).toEqual({acceleration,smaller_reporting:src});});
 it.each(['Smaller Reporting Company','Emerging Growth Company','','—'])('%j alone → no usable category',raw=>{expect(parseFilerCategory(raw)).toBeNull();});
});

describe('cover and 10-K selection',()=>{
 it('reads dei values from the inline XBRL cover',()=>{
  expect(coverOf(cover('Large Accelerated Filer'))).toEqual({category:'Large Accelerated Filer',periodEnd:'2024-12-31'});
  expect(coverOf(cover(null))).toEqual({category:null,periodEnd:'2024-12-31'});
 });
 it('takes the latest 3 original 10-Ks by filing date, never amendments',()=>{
  const v:SubmissionsView={cik10:'0000000001',sha256:'s',category:null,fiscalYearEnd:'1231',entries:[
   entry('a1','2022-02-20','2021-12-31'),entry('a2','2023-02-20','2022-12-31'),entry('a3','2024-02-20','2023-12-31'),entry('a4','2025-02-20','2024-12-31'),
   entry('a5','2025-03-01','2024-12-31',{form:'10-K/A'}),entry('a6','2025-04-01','2025-03-31',{form:'10-Q'})]};
  expect(latestTenKs(v).map(e=>e.accessionNumber)).toEqual(['a4','a3','a2']);
 });
});

describe('N−1 applicability (Rule 12b-2)',()=>{
 const row=(fy:number,acceleration:FilerCategoryRow['acceleration']):FilerCategoryRow=>({issuer_id:ISSUER,fiscal_year:fy,acceleration,smaller_reporting:null,category_raw:acceleration,source:'ixbrl_dei',accession:`x-${fy}`,evidence_sha256:'e',as_of:'2026-11-01'});
 it('fiscal year N uses the FY N−1 cover; the FY N cover is ignored for N',()=>{
  expect(applicableCategory([row(2025,'accelerated'),row(2026,'large_accelerated')],2026)?.acceleration).toBe('accelerated');
 });
 it('no FY N−1 cover → the calendar has no rule for FY N',()=>{
  const rows=computeExpectations({profile:{issuer_id:ISSUER,market:'US',category_raw_current:null,regime:'10-K',fiscal_year_end:'1231',week52_pattern:false,source:'sec_submissions',source_sha256:null,as_of:'2026-11-01'},categories:[row(2026,'large_accelerated')],filings:[],upstream:{lookup:'ok',us:[]},today:'2026-11-05'});
  expect(rows.every(r=>r.deadline_state==='no_rule'&&r.due_rule==='none.no_category_for_fy/1')).toBe(true);
 });
});

describe('syncFilerCategories',()=>{
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
const fromMs=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const addDays=(iso:string,n:number)=>fromMs(toMs(iso)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((toMs(a)-toMs(b))/DAY);
/** Last day of month m (1..12; values outside 1..12 roll over years). */
export const monthEnd=(y:number,m:number)=>fromMs(Date.UTC(y,m,0));
const ym=(iso:string)=>({y:+iso.slice(0,4),m:+iso.slice(5,7)});
export const isMonthEnd=(iso:string)=>{const {y,m}=ym(iso);return monthEnd(y,m)===iso;};
/** The month end closest to the date (52/53-week period ends fall within a week of one). */
export function nearestMonthEnd(iso:string):string{
 const {y,m}=ym(iso);const cur=monthEnd(y,m),prev=monthEnd(y,m-1);
 return Math.abs(diffDays(iso,prev))<Math.abs(diffDays(cur,iso))?prev:cur;
}
/** n months later; a month-end stays a month-end, any other day is clamped to the target month's length. */
export function addMonthsAnchored(iso:string,n:number):string{
 const {y,m}=ym(iso);
 if(isMonthEnd(iso))return monthEnd(y,m+n);
 const last=monthEnd(y,m+n);
 return +iso.slice(8,10)>+last.slice(8,10)?last:`${last.slice(0,8)}${iso.slice(8,10)}`;
}
/** Fiscal year label = calendar year of the month end nearest the fiscal-year-end date (shared with filer-categories). */
export const fiscalYearOfPeriodEnd=(periodEnd:string)=>+nearestMonthEnd(periodEnd).slice(0,4);
/** Rule 12b-2 applicability: periods of fiscal year N use the category from the FY N−1 10-K cover; none → null (no_rule). */
export const applicableCategory=(categories:readonly FilerCategoryRow[],fiscalYear:number):FilerCategoryRow|null=>categories.find(c=>c.fiscal_year===fiscalYear-1)??null;

// ---------------------------------------------------------------- Rule 0-3 roll-forward
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

codex
The streaming and failure-isolation changes improve robustness, but the classifier substitution introduces a category-parsing regression that can produce incorrect filing deadlines.

Review comment:

- [P2] Preserve non-accelerated variants in the shared classifier — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/filer-categories.ts:43-43
  For cover text such as `Nonaccelerated Filer` or `Non- accelerated Filer`, the previous regex returned `non_accelerated`, but the shared `filerClass` misses both negative forms and matches the `accelerated filer` substring instead. This silently persists the wrong acceleration category, which `computeExpectations` then uses to calculate earlier filing deadlines. Extend the shared classifier to preserve the previously accepted variants before delegating to it, and add regression tests for these inputs.
The streaming and failure-isolation changes improve robustness, but the classifier substitution introduces a category-parsing regression that can produce incorrect filing deadlines.

Review comment:

- [P2] Preserve non-accelerated variants in the shared classifier — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/filer-categories.ts:43-43
  For cover text such as `Nonaccelerated Filer` or `Non- accelerated Filer`, the previous regex returned `non_accelerated`, but the shared `filerClass` misses both negative forms and matches the `accelerated filer` substring instead. This silently persists the wrong acceleration category, which `computeExpectations` then uses to calculate earlier filing deadlines. Extend the shared classifier to preserve the previously accepted variants before delegating to it, and add regression tests for these inputs.

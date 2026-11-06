OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b132-998a-7f30-a999-55614bdf6e44
--------
user
commit 9b4a8dc
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 9b4a8dc; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1973ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-FKMwUO6N' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-4nPciFXO' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ivjZsb3c' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nDWtRxIA' (errno=Operation not permitted)
9b4a8dc fix(dq): iXBRL pair review fixes (no left precision, dry-run isolation, streamed byte limits, required tickers)
 src/lib/dq/reconcile/pair-us-ixbrl.test.ts | 42 +++++++++++++++++++++++++++++-
 src/lib/dq/reconcile/pair-us-ixbrl.ts      | 42 ++++++++++++++++++++++--------
 src/lib/dq/reconcile/us-sample.test.ts     |  5 ++++
 src/lib/dq/reconcile/us-sample.ts          |  3 ++-
 4 files changed, 79 insertions(+), 13 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.md AGENTS.override.md; do test ! -f "$p/$f" || { echo "$p/$f"; cat "$p/$f"; }; done; done; git show 9b4a8dc --; cat src/lib/dq/reconcile/pair-us-ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-B9DJw0E5' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-iPRxpaTA' (errno=Operation not permitted)
commit 9b4a8dcd3b0fd327998f44fec755bd16a50a8f88
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:10:33 2026 -0800

    fix(dq): iXBRL pair review fixes (no left precision, dry-run isolation, streamed byte limits, required tickers)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
index ce36c9f..f4ad2da 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
@@ -8,7 +8,7 @@ import {computeInputsHash} from './inputs-hash';
 import {IXBRL_PARSER_VERSION} from './ixbrl';
 import {sha256Hex} from './pair-support';
 import type {PairRunContext} from './pair-support';
-import {filerClass,usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
+import {fetchSecDocument,filerClass,usCompanyfactsVsIxbrlPair} from './pair-us-ixbrl';
 import {RECONCILE_PAIRS,inputsHashNow} from './pairs';
 import {reconcileTables,seedPublished} from './testing';
 import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA} from './us-sample';
@@ -121,6 +121,7 @@ describe('us.companyfacts_vs_ixbrl',()=>{
   expect(res.slice(KEYS.length).map(r=>r.outcome)).toEqual(['left_unlinked','left_unlinked','left_unlinked','left_unlinked']);
   expect(s.fetch.mock.calls.map(c=>c[0])).toEqual([URL1]);
   expect(await s.tables.select('dq_reconciliations',{})).toEqual([]);
+  expect(s.raw.objects.size).toBe(0);   // dry run: the 404 body went to an ephemeral store
  });
  it('is_inline_xbrl=false → every key unsupported(not_inline_xbrl), no fetch; an invalid sample refuses the run',async()=>{
   const s=await setup({sample:sample([filing(ACCN,URL1,KEYS,{is_inline_xbrl:false})]),docs:{}});
@@ -145,6 +146,45 @@ describe('us.companyfacts_vs_ixbrl',()=>{
   expect(meta).toContain('"http_status":404');expect(meta).not.toContain('?');
   expect(JSON.stringify(s.fetch.mock.calls.map(c=>c[0]))).not.toContain('?');
  });
+ it('left precision is not published (canonicalised value_text falsifies trailing zeros)',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,001')}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  const res=await pair.evaluate(s.c,m);
+  expect(res[0].detail.left).toMatchObject({precision:null,precision_note:'not_retained'});
+ });
+ it('dry run writes nothing to the injected raw store, for a success and a failure response',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,001')}});
+  const pair=usCompanyfactsVsIxbrlPair();const dry:PairRunContext={...s.c,dryRun:true};
+  const [m]=await pair.members(dry);
+  const res=await pair.evaluate(dry,m);
+  expect(res[0].right_value).toBe('1000');expect(res[0].detail.right).toMatchObject({sha256:sha256Hex(docOf('5,001'))});
+  expect(s.raw.objects.size).toBe(0);
+  const bad:PairRunContext={...s.c,dryRun:true,fetch:(async()=>new Response('nope',{status:404})) as unknown as typeof fetch};
+  expect(await fetchSecDocument(URL1,bad)).toEqual({status:'not_found'});
+  expect(s.raw.objects.size).toBe(0);
+ });
+ it('enforces byte limits while streaming, without Content-Length',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
+  const MB=1024*1024;let pulled=0;
+  const stream=(chunks:number)=>new ReadableStream<Uint8Array>({pull(c){if(pulled>=chunks){c.close();return;}pulled++;c.enqueue(new Uint8Array(MB));}});
+  const big:PairRunContext={...s.c,fetch:(async()=>new Response(stream(80),{status:200})) as unknown as typeof fetch};
+  expect(await fetchSecDocument(URL1,big)).toEqual({status:'too_large'});
+  expect(pulled).toBeLessThanOrEqual(52);   // cancelled shortly after 50 MB, not drained
+  pulled=0;
+  const fail:PairRunContext={...s.c,fetch:(async()=>new Response(stream(5),{status:404})) as unknown as typeof fetch};
+  expect(await fetchSecDocument(URL1,fail)).toEqual({status:'not_found'});
+  const bodies=[...s.raw.objects.entries()].filter(([p])=>!p.endsWith('.meta.json'));
+  expect(bodies).toHaveLength(1);expect(bodies[0][1].byteLength).toBe(MB);
+  expect([...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('')).toContain('"truncated":1');
+ },30_000);
+ it('stored metadata never carries a query string, even when the URL handed to the storing path has one',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
+  const withQuery=`${URL1}?token=secret&x=1#frag`;
+  const ok:PairRunContext={...s.c,fetch:(async()=>new Response('x',{status:404})) as unknown as typeof fetch};
+  await fetchSecDocument(withQuery,ok);
+  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('');
+  expect(meta).toContain('zix-20241231.htm');expect(meta).not.toMatch(/token|secret|\?|#frag/);
+ });
  it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
   expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
    .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.ts b/src/lib/dq/reconcile/pair-us-ixbrl.ts
index aeae766..a49d1ac 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.ts
@@ -16,7 +16,7 @@
 //     right_missing; several distinct values → right_ambiguous (never quarantines);
 //  5. exact comparison (tolerance 0: the iXBRL value is the filed value); action by actionFor (quarantine
 //     only an ok left row, bound keys go back to their item). detail: left {fact_id, raw_hash, status,
-//     precision.decimals = fraction digits of value_text}, right {document, sha256, path, locator {name,
+//     precision null (value_text is canonicalised, trailing zeros are not retained)}, right {document, sha256, path, locator {name,
 //     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
 //     sha256, sample sha256, IXBRL_PARSER_VERSION).
 // currentRight (restore, plan audit P2): the sample filing that holds the result's natural key, its primary
@@ -26,13 +26,15 @@
 import {conceptById} from '../../facts/concepts';
 import {tagsOf} from '../../facts/providers/edgar-companyfacts';
 import {secPacer,sleep} from '../../facts/providers/shared';
+import {memoryRawStore} from '../raw-store';
+import type {RawStore} from '../raw-store';
 import type {FactRow} from '../../facts/types';
 import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
 import {compareDecimal} from './decimal';
 import {computeInputsHash} from './inputs-hash';
 import {IXBRL_PARSER_VERSION,IxbrlParseError,MAX_IXBRL_BYTES,indexIxFacts,ixFactKey,parseInlineXbrl} from './ixbrl';
 import type {IxbrlDocument,IxFact} from './ixbrl';
-import {ReconcileConfigError,actionFor,activeRows,comparedNumeric,factKeyOf,fractionDigits,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
+import {ReconcileConfigError,runContextOf,actionFor,activeRows,comparedNumeric,factKeyOf,mismatchItem,notCompared,openMismatches,readRepoJson,sha256Hex} from './pair-support';
 import type {RegisteredPair} from './pair-support';
 import type {MemberPlan,PairContext,ReconcileOutcome,ReconcileResultInput} from './types';
 import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
@@ -46,11 +48,29 @@ export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status
 /** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
 const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
 const FAILURE_BODY_CAP=1024*1024;
-/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped, best effort on read. */
+/** Dry runs never write production storage: evidence goes to an ephemeral in-memory store (hashes are still computed locally). */
+const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStore():ctx.raw;
+/**
+ * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
+ * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
+ */
+async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
+ if(!res.body){const all=new Uint8Array(await res.arrayBuffer());return all.byteLength>limit?{bytes:all.slice(0,limit),exceeded:true}:{bytes:all,exceeded:false};}
+ const reader=res.body.getReader();const chunks:Uint8Array[]=[];let n=0;
+ for(;;){
+  const {done,value}=await reader.read();
+  if(done)break;
+  if(n+value.byteLength>limit){chunks.push(value.slice(0,limit-n));n=limit;await reader.cancel().catch(()=>undefined);return {bytes:concat(chunks,n),exceeded:true};}
+  chunks.push(value);n+=value.byteLength;
+ }
+ return {bytes:concat(chunks,n),exceeded:false};
+}
+function concat(chunks:Uint8Array[],n:number):Uint8Array{const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}return out;}
+/** A non-accepted response body is evidence too (404 page, SEC error page): stored content-addressed, capped at 1 MB (truncated + flagged). */
 async function storeFailure(ctx:PairContext,res:Response,url:string):Promise<void>{
- let bytes:Uint8Array;
- try{bytes=new Uint8Array(await res.arrayBuffer()).slice(0,FAILURE_BODY_CAP);}catch{bytes=new Uint8Array();}
- await ctx.raw.put({kind:'sec-document',bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure'}},ctx.budget);
+ let got:{bytes:Uint8Array;exceeded:boolean};
+ try{got=await readLimited(res,FAILURE_BODY_CAP);}catch{got={bytes:new Uint8Array(),exceeded:false};}
+ await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(url),http_status:res.status,outcome:'failure',...(got.exceeded?{truncated:1}:{})}},ctx.budget);
 }
 export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFetch>{
  const ua=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
@@ -66,9 +86,9 @@ export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFe
    throw new Error(`sec_unavailable:http_${res.status}`);
   }
   if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
-  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES)return {status:'too_large'};
-  const bytes=new Uint8Array(await res.arrayBuffer());
-  return bytes.byteLength>MAX_IXBRL_BYTES?{status:'too_large'}:{status:'ok',bytes};
+  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large'};}
+  const got=await readLimited(res,MAX_IXBRL_BYTES);
+  return got.exceeded?{status:'too_large'}:{status:'ok',bytes:got.bytes};
  }
 }
 
@@ -94,7 +114,7 @@ async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Righ
  if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
  const got=await fetchSecDocument(f.doc_url,ctx);
  if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:''};
- const stored=await ctx.raw.put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
+ const stored=await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
  let doc:IxbrlDocument;
  try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
  catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
@@ -152,7 +172,7 @@ export function usCompanyfactsVsIxbrlPair():RegisteredPair{
      const rightSha=right.sha256;
      const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
      const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
-      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:{decimals:fractionDigits(left.value_text)}}:null};
+      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
      const backToItem=bound!==undefined&&left!==null;
      const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
      if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
diff --git a/src/lib/dq/reconcile/us-sample.test.ts b/src/lib/dq/reconcile/us-sample.test.ts
index d604831..66c441f 100644
--- a/src/lib/dq/reconcile/us-sample.test.ts
+++ b/src/lib/dq/reconcile/us-sample.test.ts
@@ -73,6 +73,11 @@ describe('pickSample (spec §5.3 sample rule)',()=>{
   expect(new Set(picked.map(p=>p.ticker)).size).toBe(30);
   expect(picked.map(p=>p.ticker)).toEqual([...picked.map(p=>p.ticker)].sort());
  });
+ it('reports a mandatory gold ticker that is not a candidate even when every quota passes',()=>{
+  const all=[...Array.from({length:60},(_,i)=>cand(i)),cand(101,{ticker:'MSFT',exchange:'Nasdaq',fiscalYearEnd:'0630'}),cand(102,{ticker:'ZNAS',exchange:'Nasdaq'}),cand(103,{ticker:'ZNAS2',exchange:'Nasdaq'}),cand(104,{ticker:'ZACC',acceleration:'accelerated'}),cand(105,{ticker:'ZNON',acceleration:'non_accelerated',fiscalYearEnd:'0630'})];
+  const {picked,unmet}=pickSample(all,['AAPL','MSFT'],30);
+  expect(unmet).toEqual(['required:AAPL']);expect(picked.map(p=>p.ticker)).toContain('MSFT');
+ });
  it('reports a quota that cannot be met instead of inventing candidates',()=>{
   const {picked,unmet}=pickSample(Array.from({length:10},(_,i)=>cand(i)),[],30);
   expect(picked).toHaveLength(10);
diff --git a/src/lib/dq/reconcile/us-sample.ts b/src/lib/dq/reconcile/us-sample.ts
index 92202fc..89f0ddd 100644
--- a/src/lib/dq/reconcile/us-sample.ts
+++ b/src/lib/dq/reconcile/us-sample.ts
@@ -140,5 +140,6 @@ export function pickSample(candidates:readonly SampleCandidate[],required:readon
    picked.splice(out,1,incoming);
   }
  }
- return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)};
+ const missing=[...req].filter(t=>!picked.some(p=>p.ticker===t)).sort().map(t=>`required:${t}`);
+ return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)]};
 }
// src/lib/dq/reconcile/pair-us-ixbrl.ts
// us.companyfacts_vs_ixbrl (spec §5.2, §5.3, T1). Members and expected keys come ONLY from the frozen sample
// manifest (US_SAMPLE_PATH). Per accession, in this order:
//  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
//  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 429/5xx retried twice then THROWN = execution failure),
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

export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large'};
/** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
const FAILURE_BODY_CAP=1024*1024;
/** Dry runs never write production storage: evidence goes to an ephemeral in-memory store (hashes are still computed locally). */
const storeOf=(ctx:PairContext):RawStore=>runContextOf(ctx).dryRun?memoryRawStore():ctx.raw;
/**
 * Reads at most `limit` bytes of the body while streaming; past the limit the stream is cancelled and
 * exceeded=true (bytes then hold the first `limit` bytes). A response without a stream falls back to arrayBuffer.
 */
async function readLimited(res:Response,limit:number):Promise<{bytes:Uint8Array;exceeded:boolean}>{
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
  if(res.status===429||res.status>=500){
   await storeFailure(ctx,res,url);
   if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
   throw new Error(`sec_unavailable:http_${res.status}`);
  }
  if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large'};}
  const got=await readLimited(res,MAX_IXBRL_BYTES);
  return got.exceeded?{status:'too_large'}:{status:'ok',bytes:got.bytes};
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

type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string};
async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
 if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
 const got=await fetchSecDocument(f.doc_url,ctx);
 if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:''};
 const stored=await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
 let doc:IxbrlDocument;
 try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
 catch(e){if(e instanceof IxbrlParseError)return {kind:'unsupported',reason:`parse_error:${e.code}`,sha256:stored.sha256};throw e;}
 if(doc.unsupported.some(u=>u.reason==='not_inline_xbrl'))return {kind:'unsupported',reason:'not_inline_xbrl',sha256:stored.sha256};
 const filer=doc.facts.filter(x=>entityIs(x.entity,cik)).map(x=>({...x,entity:'filer'}));
 return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
}

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
   }
   return out;
  },
  async evaluate(ctx,member){
   const {sample,sha256:sampleSha}=await loadSample(ctx);
   const open=await openMismatches(ctx.tables,PAIR,'US');
   const results:ReconcileResultInput[]=new Array(member.expectedKeys.length);
   const groups=new Map<string,number[]>();
   member.expectedKeys.forEach((k,i)=>{const loc=k.locator as unknown as KeyLoc;const g=`${loc.cik}|${loc.accn}`;groups.set(g,[...(groups.get(g)??[]),i]);});
   for(const [g,idxs] of groups){
    const [cik,accn]=g.split('|');
    const entry=sample.issuers.find(x=>x.cik===cik)?.filings.find(f=>f.accn===accn);
    const every=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>{for(const i of idxs)results[i]=notCompared(member.expectedKeys[i].naturalKey,'numeric',outcome,SIDES,{accn,...detail});};
    if(!entry){every('unsupported',{reason:'sample_changed'});continue;}
    const filing=await ctx.db.findFilingBySourceRef('edgar',accn);
    if(!filing){every('left_unlinked',{});continue;}
    const right=await rightSide(ctx,entry,cik);
    const byKey=new Map<string,FactRow[]>();
    if(right.kind==='ok'||open.size>0)for(const r of activeRows(await ctx.db.readFilingFacts(filing.filing_id,true),filing)){const kf=factKeyOf(r);byKey.set(kf,[...(byKey.get(kf)??[]),r]);}
    for(const i of idxs){
     const k=member.expectedKeys[i];const loc=k.locator as unknown as KeyLoc;const nk=k.naturalKey;
     const bound=open.get(nk);
     const rows=bound?(await ctx.db.factsByIds([bound.factIds[0]])).slice(0,1):(byKey.get(factKeyOf(loc))??[]);
     const left=rows.length===1?rows[0]:null;
     const rightSha=right.sha256;
     const inputs_hash=computeInputsHash({left_raw_hash:left?.raw_hash??'',right_sha256:rightSha,gold_or_sample_sha256:sampleSha,parser_version:IXBRL_PARSER_VERSION});
     const base={accn,origin:loc.origin,unit:loc.unit,tolerance_rule:'exact/1',inputs_hash,
      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
     const backToItem=bound!==undefined&&left!==null;
     const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
     const rightBase={document:entry.doc_url,sha256:rightSha,path:right.path,...(right.shaMismatch?{doc_sha_mismatch:true}:{})};
     if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
     if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
     const l=left!;
     const def=conceptById(loc.concept);
     const tags=[l.source_concept,...(def?tagsOf(def):[]).filter(t=>t!==l.source_concept)];
     let hit:{values:string[];facts:IxFact[]}|undefined;let tag:string|undefined;
     for(const t of tags){const h=right.index.get(ixFactKey({name:t,entity:'filer',periodStart:loc.period_start,periodEnd:loc.period_end,unit:loc.unit}));if(h){hit=h;tag=t;break;}}
     if(!hit||tag===undefined){
      const u=right.doc.unsupported.find(x=>x.name!==undefined&&tags.includes(x.name)&&x.periodEnd===loc.period_end&&(x.periodStart??null)===loc.period_start);
      results[i]=u?nc('unsupported',{reason:u.reason,right:{...rightBase,locator:{name:u.name,contextRef:u.contextRef}}}):nc('right_missing',{right:rightBase});
      continue;
     }
     const first=hit.facts[0];
     const locator={name:tag,contextRef:first.contextRef,unitRef:first.unitRef};
     if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
     const rv=hit.values[0];
     const passed=compareDecimal(l.value,rv)===0;
     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:'quarantine_left'});
     results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
      ...(action==='record'?{}:{item:mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash)})});
    }
   }
   return results;
  },
 };
}

exec
/bin/zsh -lc "cat src/lib/dq/raw-store.ts; sed -n '1,95p' src/lib/dq/reconcile/pair-support.ts; sed -n '100,170p' src/lib/dq/reconcile/us-sample.ts; cat package.json; rg 'precision' src/lib/dq/reconcile -n | head -30; ls -a | head -30" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange'];
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
// src/lib/dq/reconcile/pair-support.ts
// Pieces shared by the cycle pairs (spec §5.1–§5.6). RegisteredPair = C3 ReconcilePair plus its input
// recipe (repo file, parser version, gold schema) used for batch tool_versions and inputs_hash.
// PairRunContext = PairContext plus the batch id and dry-run flag the runner passes (record.ts side rows
// need the batch; dry runs must not write). ReconcileConfigError refuses a run (invalid gold/sample file,
// unresolvable issuer) — the runner finishes the batch failed with the code. activeRows is the T1/S2
// binding filter over read_filing_facts rows. openMismatches is the explicit re-check binding: an OPEN
// reconcile_mismatch item of this pair (natural_key '<pair>:<result natural_key>:<fact_id>') pins its key
// to payload.fact_ids[0] whatever the generation or status. Result builders keep the dq_reconciliations
// kind/side rules; actionFor is the one action rule every fact-backed pair uses (contract note 2).
import {createHash} from 'node:crypto';
import {selectAll} from '../../db/table-client';
import type {Row,TableClient} from '../../db/table-client';
import {keyComponents} from '../../facts/keys';
import type {FactRow,FactStatus,FilingFactRow,FilingRow,Market} from '../../facts/types';
import {DATASETS} from '../datasets';
import {absDecimal,relDiff,subDecimal} from './decimal';
import type {CyclePairId,MemberPlan,PairContext,ReconcileAction,ReconcileKind,ReconcileOutcome,ReconcilePair,ReconcileResultInput} from './types';

export interface PairInputs{repoFile:string|null;parserVersion:string;goldSchema:string|null}
/**
 * The CURRENT right-side evidence of one stored result (restore, spec §3.2 / §5.6; plan audit P2): the
 * sha256 the pair would read NOW for `rec` (its dq_reconciliations row, keyed by rec.natural_key) — iXBRL:
 * the current primary document fetched and hashed now; gold pairs: the current manifest's evidence for the
 * key — or null when it cannot be obtained now (fetch failed, entry gone or pending). Never the sha256 the
 * last run recorded (rec.detail.right.sha256).
 */
export type CurrentRight=(ctx:PairContext,rec:Row)=>Promise<string|null>;
export interface RegisteredPair extends ReconcilePair{
 inputs:PairInputs;currentRight:CurrentRight;
 /**
  * Expected keys of ONE target (plan audit Q2): the runner calls it for every pending_members target that
  * members(ctx) did not list, after its pending snapshot, so the merge is already visible. Its answer is
  * final for the cycle (a zero-key plan is a resolved answer). Only pairs that receive pending members
  * (facts.lineage_same_day) implement it; a pending entry for a pair without it fails the run.
  */
 memberFor?(ctx:PairContext,issuerId:string,market:Market):Promise<MemberPlan>;
}
export interface PairRunContext extends PairContext{batchId:string|null;dryRun:boolean}
/** The run context behind a PairContext; a context without the flags counts as a dry run (no side writes). */
export const runContextOf=(ctx:PairContext):PairRunContext=>{const c=ctx as Partial<PairRunContext>;return {...ctx,batchId:c.batchId??null,dryRun:c.dryRun??true};};

export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated'|'lineage_key_collision';
export class ReconcileConfigError extends Error{constructor(public readonly code:ReconcileConfigCode,message?:string){super(message??code);this.name='ReconcileConfigError';}}

export const sha256Hex=(b:Uint8Array|string):string=>createHash('sha256').update(b).digest('hex');
export const todayOf=(ctx:PairContext):string=>ctx.now().toISOString().slice(0,10);
/** Repo JSON with the sha256 of its exact bytes; unreadable or malformed → ReconcileConfigError(code). */
export async function readRepoJson(ctx:PairContext,path:string,code:'invalid_gold_file'|'invalid_sample_file'):Promise<{json:unknown;sha256:string}>{
 let bytes:Uint8Array;
 try{bytes=await ctx.readRepoFile(path);}catch(e){throw new ReconcileConfigError(code,`read ${path}: ${e instanceof Error?e.message:String(e)}`);}
 try{return {json:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256Hex(bytes)};}
 catch{throw new ReconcileConfigError(code,`json ${path}`);}
}

/** T1 binding filter: rows of the filing's ACTIVE generation (> 0) from published runs, ok or quarantined. */
export function activeRows(rows:readonly FilingFactRow[],filing:FilingRow):FilingFactRow[]{
 if(!(filing.mapping_gen>0))return [];
 return rows.filter(r=>r.mapping_gen===filing.mapping_gen&&r.run_status==='published'&&(r.status==='ok'||r.status==='quarantined'));
}
export const factKeyOf=(r:{concept:string;period_start:string|null;period_end:string;unit:string})=>`${r.concept}|${r.period_start??''}|${r.period_end}|${r.unit}`;
export const fractionDigits=(v:string):number=>{const i=v.indexOf('.');return i<0?0:v.length-i-1;};
export const mismatchItemKey=(pair:CyclePairId,naturalKey:string,factId:string)=>`${pair}:${naturalKey}:${factId}`;

export interface OpenMismatch{itemId:string;factIds:string[]}
export async function openMismatches(tables:TableClient,pair:CyclePairId,market:Market):Promise<Map<string,OpenMismatch>>{
 const rows=await selectAll(tables,'dq_quarantine',{dataset:DATASETS.facts(market),reason_code:'reconcile_mismatch',status:'open'},'id');
 const out=new Map<string,OpenMismatch>();const prefix=`${pair}:`;
 for(const r of rows){
  if(((r.detail??{}) as {pair?:unknown}).pair!==pair)continue;
  const raw=((r.payload??{}) as {fact_ids?:unknown}).fact_ids;
  const factIds=Array.isArray(raw)?raw.filter((x):x is string=>typeof x==='string'):[];
  const nk=String(r.natural_key);
  if(factIds.length===0||!nk.startsWith(prefix)||!nk.endsWith(`:${factIds[0]}`))continue;
  out.set(nk.slice(prefix.length,nk.length-factIds[0].length-1),{itemId:String(r.id),factIds});
 }
 return out;
}

export interface Sides{left_source:string;right_source:string}
export interface ResultExtras{left_fact_id?:string;inputs_hash?:string;action?:ReconcileAction;item?:ReconcileResultInput['item']}
const extras=(x:ResultExtras)=>({...(x.left_fact_id!==undefined?{left_fact_id:x.left_fact_id}:{}),...(x.inputs_hash!==undefined?{inputs_hash:x.inputs_hash}:{}),...(x.item!==undefined?{item:x.item}:{})});
/** A non-compared result: every value column null, passed false, detail.reason defaults to the outcome. */
export function notCompared(natural_key:string,kind:ReconcileKind,outcome:Exclude<ReconcileOutcome,'compared'>,sides:Sides,detail:Record<string,unknown>,x:ResultExtras={}):ReconcileResultInput{
 return {natural_key,kind,outcome,passed:false,left_value:null,right_value:null,abs_diff:null,rel_diff:null,tolerance:'0',...sides,detail:{reason:outcome,...detail},action:x.action??'record',...extras(x)};
}
/** A compared numeric result with exact abs_diff and rel_diff. */
export function comparedNumeric(natural_key:string,left:string,right:string,o:{passed:boolean;tolerance:string;sides:Sides;detail:Record<string,unknown>}&ResultExtras):ReconcileResultInput{
 return {natural_key,kind:'numeric',outcome:'compared',passed:o.passed,left_value:left,right_value:right,abs_diff:absDecimal(subDecimal(left,right)),rel_diff:relDiff(left,right),tolerance:o.tolerance,...o.sides,detail:o.detail,action:o.action??'record',...extras(o)};
}
/** Contract note 2: bound through an open item → back to it; failed compare of an ok row → onFail; else record. */
export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
 if(o.bound)return 'quarantine_left';
 if(o.compared&&!o.passed&&o.leftStatus==='ok')return o.onFail;
 return 'record';
    const ka=`${fa}.expected_keys[${ki}]`;
    const def=typeof k?.concept==='string'?conceptById(k.concept):undefined;
    if(!def)e(`${ka}.concept`);
    if(k?.period_start!==null&&!(typeof k?.period_start==='string'&&DATE.test(k.period_start)))e(`${ka}.period_start`);
    if(typeof k?.period_end!=='string'||!DATE.test(k.period_end))e(`${ka}.period_end`);
    if(typeof k?.unit!=='string'||k.unit==='')e(`${ka}.unit`);
    if(typeof k?.source_concept!=='string'||k.source_concept==='')e(`${ka}.source_concept`);
    if(k?.origin!=='left'&&k?.origin!=='right'&&k?.origin!=='both')e(`${ka}.origin`);
    if(k?.origin!=='right')nl++;if(k?.origin!=='left')nr++;
    const nk=usNaturalKey(String(iss.cik),String(f.accn),k);
    if(nks.has(nk))e(`${ka}: duplicate ${nk}`);nks.add(nk);
   });
   if(nl<MIN_KEYS_PER_SIDE||nr<MIN_KEYS_PER_SIDE)e(`${fa}: fewer than ${MIN_KEYS_PER_SIDE} keys per side (left=${nl}, right=${nr})`);
  });
 });
 return errors.length>0?{ok:false,errors}:{ok:true,sample:s as UsSample};
}

export interface SampleCandidate{ticker:string;cik:string;exchange:string|null;fiscalYearEnd:string|null;acceleration:'large_accelerated'|'accelerated'|'non_accelerated'|null}
const QUOTAS:readonly {name:string;min:number;test:(c:SampleCandidate)=>boolean}[]=[
 {name:'nyse',min:3,test:c=>c.exchange==='NYSE'},
 {name:'nasdaq',min:3,test:c=>c.exchange!==null&&c.exchange.toLowerCase()==='nasdaq'},
 {name:'fye_not_1231',min:2,test:c=>c.fiscalYearEnd!==null&&c.fiscalYearEnd!=='1231'},
 {name:'not_large_accelerated',min:2,test:c=>c.acceleration!==null&&c.acceleration!=='large_accelerated'},
];
export function pickSample(candidates:readonly SampleCandidate[],required:readonly string[],n=30):{picked:SampleCandidate[];unmet:string[]}{
 const sorted=[...candidates].sort((a,b)=>cmp(a.ticker,b.ticker));
 const req=new Set(required);
 const picked=sorted.filter(c=>req.has(c.ticker));
 const others=sorted.filter(c=>!req.has(c.ticker));
 const k=Math.max(0,Math.min(n-picked.length,others.length));
 for(let i=0;i<k;i++)picked.push(others[Math.floor(i*others.length/k)]);
 const count=(q:typeof QUOTAS[number])=>picked.filter(q.test).length;
 for(const q of QUOTAS){
  while(count(q)<q.min){
   const incoming=sorted.find(c=>!picked.includes(c)&&q.test(c));
   if(!incoming)break;
   if(picked.length<n){picked.push(incoming);continue;}
   const out=[...picked.keys()].reverse().find(i=>!req.has(picked[i].ticker)&&!q.test(picked[i])&&QUOTAS.every(o=>o===q||!o.test(picked[i])||count(o)>o.min));
   if(out===undefined)break;
   picked.splice(out,1,incoming);
  }
 }
 const missing=[...req].filter(t=>!picked.some(p=>p.ticker===t)).sort().map(t=>`required:${t}`);
 return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)]};
}
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
src/lib/dq/reconcile/pair-us-gold.ts:121:     detail:{left:{fact_id:left.fact_id,raw_hash:left.raw_hash,precision:{decimals:fractionDigits(left.value_text)}},right:{document:US_GOLD_PATH,sha256:goldSha,locator,precision:{exact:true}},unit:e.unit,tolerance_rule:'exact/1',inputs_hash,as_of:e.as_of,...(lineageConflict?{lineage_conflict:true}:{}),...(asOfMissing?{as_of_missing:true}:{})},
src/lib/dq/reconcile/pair-us-ixbrl.ts:19://     precision null (value_text is canonicalised, trailing zeros are not retained)}, right {document, sha256, path, locator {name,
src/lib/dq/reconcile/pair-us-ixbrl.ts:20://     contextRef, unitRef}, precision {decimals, scale}}, inputs_hash = computeInputsHash(left raw_hash, right
src/lib/dq/reconcile/pair-us-ixbrl.ts:175:      left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
src/lib/dq/reconcile/pair-us-ixbrl.ts:199:      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:149: it('left precision is not published (canonicalised value_text falsifies trailing zeros)',async()=>{
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:153:  expect(res[0].detail.left).toMatchObject({precision:null,precision_note:'not_retained'});
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
/bin/zsh -lc "sed -n '40,57p' src/lib/dq/reconcile/pair-support.ts; rg 'pickSample|unmet' scripts/dq/select-us-sample.ts; ls vitest*; node node_modules/vitest/vitest.mjs run src/lib/dq/reconcile/pair-us-ixbrl.test.ts src/lib/dq/reconcile/us-sample.test.ts --no-cache" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 290ms:
/** The run context behind a PairContext; a context without the flags counts as a dry run (no side writes). */
export const runContextOf=(ctx:PairContext):PairRunContext=>{const c=ctx as Partial<PairRunContext>;return {...ctx,batchId:c.batchId??null,dryRun:c.dryRun??true};};

export type ReconcileConfigCode='invalid_gold_file'|'invalid_sample_file'|'issuer_unresolved'|'lineage_read_truncated'|'lineage_key_collision';
export class ReconcileConfigError extends Error{constructor(public readonly code:ReconcileConfigCode,message?:string){super(message??code);this.name='ReconcileConfigError';}}

export const sha256Hex=(b:Uint8Array|string):string=>createHash('sha256').update(b).digest('hex');
export const todayOf=(ctx:PairContext):string=>ctx.now().toISOString().slice(0,10);
/** Repo JSON with the sha256 of its exact bytes; unreadable or malformed → ReconcileConfigError(code). */
export async function readRepoJson(ctx:PairContext,path:string,code:'invalid_gold_file'|'invalid_sample_file'):Promise<{json:unknown;sha256:string}>{
 let bytes:Uint8Array;
 try{bytes=await ctx.readRepoFile(path);}catch(e){throw new ReconcileConfigError(code,`read ${path}: ${e instanceof Error?e.message:String(e)}`);}
 try{return {json:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),sha256:sha256Hex(bytes)};}
 catch{throw new ReconcileConfigError(code,`json ${path}`);}
}

/** T1 binding filter: rows of the filing's ACTIVE generation (> 0) from published runs, ok or quarantined. */
export function activeRows(rows:readonly FilingFactRow[],filing:FilingRow):FilingFactRow[]{
rg: scripts/dq/select-us-sample.ts: IO error for operation on scripts/dq/select-us-sample.ts: No such file or directory (os error 2)
vitest.config.ts
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/dq/reconcile/us-sample.test.ts (0 test)
 ❯ src/lib/dq/reconcile/pair-us-ixbrl.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/dq/reconcile/pair-us-ixbrl.test.ts [ src/lib/dq/reconcile/pair-us-ixbrl.test.ts ]
 FAIL  src/lib/dq/reconcile/us-sample.test.ts [ src/lib/dq/reconcile/us-sample.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/IWp0WHXHtu68r9K-dceI-/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  06:11:12
   Duration  164ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the changed code. Targeted tests could not execute because the read-only sandbox blocked Vitest’s temporary-directory creation.
No actionable regressions were identified in the changed code. Targeted tests could not execute because the read-only sandbox blocked Vitest’s temporary-directory creation.

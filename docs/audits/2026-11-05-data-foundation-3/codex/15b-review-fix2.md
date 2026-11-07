OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b140-4533-7e30-97bf-da7d1d0ae474
--------
user
commit 6caa5a4
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 6caa5a4; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1187ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-14N7b9VF' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-rxMvs5b8' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-98TDuvg6' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RTTkgbjX' (errno=Operation not permitted)
6caa5a4 fix(dq): live sample byte limits, direct dir store writes, parsed-only universe cache, universe_fetch unmet, exchange case
 scripts/dq/select-us-sample.ts              | 11 ++++++++---
 src/lib/dq/raw-dir-store.test.ts            | 17 +++++++++++++++++
 src/lib/dq/raw-dir-store.ts                 | 25 ++++++++++++-------------
 src/lib/dq/raw-store.ts                     |  2 +-
 src/lib/dq/reconcile/us-sample-live.test.ts | 18 ++++++++++++++++--
 src/lib/dq/reconcile/us-sample-live.ts      | 28 ++++++++++++++++++++--------
 6 files changed, 74 insertions(+), 27 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -30; git show 6caa5a4 --; find . -name '"'*AGENTS*' -o -name CLAUDE.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 57ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-BOayrfTz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xB8NcoUU' (errno=Operation not permitted)
commit 6caa5a440fb769d50dd1c37b9704231f93817c2e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:25:25 2026 -0800

    fix(dq): live sample byte limits, direct dir store writes, parsed-only universe cache, universe_fetch unmet, exchange case
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/select-us-sample.ts b/scripts/dq/select-us-sample.ts
index 912b2ef..d998983 100644
--- a/scripts/dq/select-us-sample.ts
+++ b/scripts/dq/select-us-sample.ts
@@ -27,11 +27,12 @@ import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/share
 import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
 import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
 import type {SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
+import {MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
 import {liveSample} from '../../src/lib/dq/reconcile/us-sample-live';
 import type {LiveInput,LiveResult} from '../../src/lib/dq/reconcile/us-sample-live';
 import {rawStoreFor} from '../../src/lib/dq/raw-dir-store';
 
-const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> --raw-dir <dir> [--n 30])';
+const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--raw-dir <dir>] [--n 30])';
 const FIXTURE_SINCE_YEAR=2016;
 const FIXTURES=[
  {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
@@ -55,7 +56,11 @@ async function get(url:string):Promise<Uint8Array>{
  await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});
  const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
  if(!res.ok)throw new Error(`http_${res.status} ${url}`);
- return new Uint8Array(await res.arrayBuffer());
+ const declared=Number(res.headers.get('content-length'));
+ if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
+ const bytes=new Uint8Array(await res.arrayBuffer());
+ if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
+ return bytes;
 }
 async function liveFromNetwork(universePath:string,n:number,rawDir:string):Promise<LiveResult>{
  const universe=JSON.parse(readFileSync(universePath,'utf8')) as LiveInput['universe'];
@@ -72,7 +77,7 @@ async function main(){
   else if(x==='--out'&&v){out=v;i++;}
   else if(x==='--universe'&&v){universe=v;i++;}
   else if(x==='--raw-dir'&&v){rawDir=v;i++;}
-  else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)){n=Number(v);i++;}
+  else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)&&Number(v)>=1){n=Number(v);i++;}
   else if(x==='--generated-at'&&v&&!Number.isNaN(Date.parse(v))){generatedAt=v;i++;}
   else{console.error(USAGE);process.exit(2);}
  }
diff --git a/src/lib/dq/raw-dir-store.test.ts b/src/lib/dq/raw-dir-store.test.ts
new file mode 100644
index 0000000..4a01817
--- /dev/null
+++ b/src/lib/dq/raw-dir-store.test.ts
@@ -0,0 +1,17 @@
+import {mkdtempSync,readFileSync,readdirSync} from 'node:fs';
+import {tmpdir} from 'node:os';
+import {join} from 'node:path';
+import {expect,it} from 'vitest';
+import {dirRawStore} from './raw-dir-store';
+
+it('writes only the stored item (data + sidecar), keeps existing files and reports status',async()=>{
+ const dir=mkdtempSync(join(tmpdir(),'rawdir-'));
+ const store=dirRawStore(dir);
+ const a=await store.put({kind:'sec-document',bytes:new TextEncoder().encode('one'),contentType:'text/html'});
+ const again=await store.put({kind:'sec-document',bytes:new TextEncoder().encode('one'),contentType:'text/html'});
+ const b=await store.put({kind:'sec-submissions',bytes:new TextEncoder().encode('{}'),contentType:'application/json'});
+ expect([a.status,again.status,b.status]).toEqual(['stored','exists','stored']);
+ expect(readFileSync(join(dir,a.path),'utf8')).toBe('one');
+ expect(readdirSync(join(dir,'sec-document')).length).toBe(2);
+ expect(JSON.parse(readFileSync(join(dir,`${a.path}.meta.json`),'utf8')).sha256).toBe(a.sha256);
+});
diff --git a/src/lib/dq/raw-dir-store.ts b/src/lib/dq/raw-dir-store.ts
index 6cb632e..190a903 100644
--- a/src/lib/dq/raw-dir-store.ts
+++ b/src/lib/dq/raw-dir-store.ts
@@ -1,25 +1,24 @@
 // src/lib/dq/raw-dir-store.ts
 // RawStore backed by a local directory (content-addressed files named by the RawStore path rules, never overwritten)
 // and the script-side store selection shared by record-ixbrl-fixture.ts and select-us-sample.ts. Scripts only.
-import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
+import {mkdirSync,writeFileSync} from 'node:fs';
 import {dirname,join} from 'node:path';
-import {memoryRawStore,supabaseRawStore} from './raw-store';
+import {RawStoreError,memoryRawStore,prepare,rawMetaPath,supabaseRawStore} from './raw-store';
 import type {RawStore} from './raw-store';
 
-/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
+/** Content-addressed files in a directory, named by the RawStore rules; written directly (no in-memory copies), existing files are kept. */
 export function dirRawStore(dir:string):RawStore{
- const mem=memoryRawStore();
  return {
-  sha256Of:mem.sha256Of,
+  sha256Of:memoryRawStore().sha256Of,
   async put(item,budget){
-   const r=await mem.put(item,budget);
-   for(const [p,bytes] of mem.objects){
-    const full=join(dir,p);
-    if(existsSync(full))continue;
-    mkdirSync(dirname(full),{recursive:true});
-    writeFileSync(full,bytes,{flag:'wx'});
-   }
-   return r;
+   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
+   const {sha256,path,meta}=prepare(item);
+   const full=join(dir,path);
+   mkdirSync(dirname(full),{recursive:true});
+   let status:'stored'|'exists'='stored';
+   try{writeFileSync(full,item.bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')status='exists';else throw e;}
+   try{writeFileSync(rawMetaPath(full),meta,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
+   return {sha256,path,status};
   },
  };
 }
diff --git a/src/lib/dq/raw-store.ts b/src/lib/dq/raw-store.ts
index 2071da2..790e53c 100644
--- a/src/lib/dq/raw-store.ts
+++ b/src/lib/dq/raw-store.ts
@@ -56,7 +56,7 @@ function sha256Of(path:string):string{
  return m[2];
 }
 
-function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
+export function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
  if(!RAW_KINDS.includes(item.kind))throw new RawStoreError('raw_invalid',`kind:${String(item.kind).slice(0,40)}`);
  const ext=RAW_EXT[item.contentType];
  if(!ext)throw new RawStoreError('raw_invalid',`content_type:${String(item.contentType).slice(0,80)}`);
diff --git a/src/lib/dq/reconcile/us-sample-live.test.ts b/src/lib/dq/reconcile/us-sample-live.test.ts
index 381ac76..0601565 100644
--- a/src/lib/dq/reconcile/us-sample-live.test.ts
+++ b/src/lib/dq/reconcile/us-sample-live.test.ts
@@ -5,7 +5,7 @@ import {describe,expect,it} from 'vitest';
 import {snapshotOf} from '../../facts/providers/shared';
 import {memoryRawStore} from '../raw-store';
 import type {RawStore} from '../raw-store';
-import {dedupeByCik,finalUnmet,liveSample} from './us-sample-live';
+import {dedupeByCik,finalUnmet,liveSample,normalizeExchange} from './us-sample-live';
 import type {LiveDeps} from './us-sample-live';
 import {validateUsSample} from './us-sample';
 import type {SampleCandidate} from './us-sample';
@@ -16,13 +16,14 @@ const AAPL={cik:'320193',accn:'0000320193-23-000106',cf:'src/lib/facts/fixtures/
 const MSFT={cik:'789019',accn:'0000950170-23-035122',cf:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'};
 const submissions=(x:typeof AAPL,primary:string)=>({category:'Large accelerated filer',fiscalYearEnd:'0930',exchanges:['Nasdaq'],filings:{recent:{accessionNumber:[x.accn],form:['10-K'],filingDate:['2023-11-03'],reportDate:['2023-09-30'],primaryDocument:[primary],isInlineXBRL:[1]}}});
 
-function world(opts:{tickers:Record<string,string>;failCompanyfacts?:string[];store?:RawStore}){
+function world(opts:{tickers:Record<string,string>;failCompanyfacts?:string[];failSubmissions?:Record<string,string>;store?:RawStore}){
  const store=opts.store??memoryRawStore();
  const byCik:Record<string,typeof AAPL>={[AAPL.cik]:AAPL,[MSFT.cik]:MSFT};
  const deps:LiveDeps={
   async get(url){
    if(url.endsWith('company_tickers.json'))return enc(Object.fromEntries(Object.entries(opts.tickers).map(([t,c],i)=>[String(i),{cik_str:Number(c),ticker:t}])));
    const sub=/submissions\/CIK0*(\d+)\.json$/.exec(url);
+   if(sub&&opts.failSubmissions?.[sub[1]])throw new Error(opts.failSubmissions[sub[1]]);
    if(sub)return enc(submissions(byCik[sub[1]],byCik[sub[1]]===AAPL?'aapl-20230930.htm':'msft-20230630.htm'));
    const doc=/Archives\/edgar\/data\/(\d+)\//.exec(url);
    if(doc)return file(byCik[doc[1]].doc);
@@ -90,3 +91,16 @@ describe('finalUnmet',()=>{
   expect(finalUnmet(sample,[...picked,cand('C','3')],['A','C'])).toEqual(expect.arrayContaining(['issuers:2/3','required:C']));
  });
 });
+
+describe('universe scan and helpers',()=>{
+ it('reports a failed universe submissions fetch as unmet and fails the run on HTTP 429',async()=>{
+  const a=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failSubmissions:{[MSFT.cik]:'http_503 x'}});
+  const r=await liveSample(a.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL'],n:30});
+  expect(r.unmet).toContain('universe_fetch:MSFT');
+  const b=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failSubmissions:{[MSFT.cik]:'http_429 x'}});
+  await expect(liveSample(b.deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL'],n:30})).rejects.toThrow('http_429');
+ });
+ it('normalises exchange case',()=>{
+  expect([normalizeExchange('nasdaq'),normalizeExchange('NASDAQ'),normalizeExchange('nyse'),normalizeExchange('Cboe'),normalizeExchange(' '),normalizeExchange(undefined)]).toEqual(['Nasdaq','Nasdaq','NYSE','Cboe',null,null]);
+ });
+});
diff --git a/src/lib/dq/reconcile/us-sample-live.ts b/src/lib/dq/reconcile/us-sample-live.ts
index 9a315fb..915fbe0 100644
--- a/src/lib/dq/reconcile/us-sample-live.ts
+++ b/src/lib/dq/reconcile/us-sample-live.ts
@@ -28,6 +28,11 @@ export interface LiveResult{sample:UsSample;unmet:string[];warnings:string[]}
 interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
 interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}
 
+/** Exchange names compared case-insensitively: NYSE stays upper case, Nasdaq is 'Nasdaq', others as given. */
+export function normalizeExchange(x:string|null|undefined):string|null{
+ const t=(x??'').trim();if(t==='')return null;
+ const u=t.toUpperCase();return u==='NASDAQ'?'Nasdaq':u==='NYSE'?'NYSE':t;
+}
 const dec=(b:Uint8Array)=>new TextDecoder().decode(b);
 function recentOf(s:Submissions):Recent[]{
  const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
@@ -71,23 +76,30 @@ export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResu
  const json=<T>(b:Uint8Array)=>JSON.parse(dec(b)) as T;
  const tickers=json<Record<string,{cik_str:number;ticker:string}>>(await deps.get('https://www.sec.gov/files/company_tickers.json'));
  const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
- const subs=new Map<string,{bytes:Uint8Array;parsed:Submissions}>();const raw:SampleCandidate[]=[];const warnings:string[]=[];
+ const subs=new Map<string,Submissions>();const raw:SampleCandidate[]=[];const warnings:string[]=[];const universeFailed=new Set<string>();
  for(const c of input.universe.constituents){
   const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
   if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
   if(!subs.has(cik)){
-   try{const bytes=await deps.get(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);subs.set(cik,{bytes,parsed:json<Submissions>(bytes)});}
-   catch(e){warnings.push(`${ticker}: ${(e as Error).message}`);continue;}
+   try{subs.set(cik,json<Submissions>(await deps.get(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`)));}
+   catch(e){
+    const m=(e as Error).message;
+    if(/http_429/.test(m))throw e;   // rate limited: the universe scan cannot be trusted, fail the run
+    warnings.push(`${ticker}: ${m}`);universeFailed.add(`universe_fetch:${ticker}`);continue;
+   }
   }
-  const s=subs.get(cik)!.parsed;
-  raw.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
+  const s=subs.get(cik)!;
+  raw.push({ticker,cik,exchange:normalizeExchange(c.exchange??s.exchanges?.[0]),fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
  }
  const dd=dedupeByCik(raw,input.required);
  const {picked,unmet:pickUnmet}=pickSample(dd.candidates,dd.required,input.n);
  const sinceYear=Number(deps.now().slice(0,4))-10;
  const issuers:SampleIssuer[]=[];
  for(const p of picked){
-  const {bytes:subBytes,parsed:s}=subs.get(p.cik)!;
+  // the submissions bytes are fetched again for picked issuers only: these exact bytes are parsed and retained
+  const subUrl=`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`;
+  const subBytes=await deps.get(subUrl);
+  const s=json<Submissions>(subBytes);
   const recent=recentOf(s).filter(r=>r.inline);
   const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
   if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
@@ -105,7 +117,7 @@ export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResu
    }catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);continue;}
    // Retain the exact bytes BEFORE the filing enters the manifest; a retention failure aborts the whole run.
    const rcf=await deps.store.put({kind:'sec-companyfacts',bytes:cf.bytes,contentType:'application/json',meta:{source_url:cf.meta.url??'',cik:p.cik}});
-   const rsub=await deps.store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`,cik:p.cik}});
+   const rsub=await deps.store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,cik:p.cik}});
    const rdoc=await deps.store.put({kind:'sec-document',bytes:doc,contentType:'text/html',meta:{source_url:url,accession:r.accn}});
    if(rcf.sha256!==built.raw_sha256||rdoc.sha256!==built.doc_sha256)throw new Error(`retention_hash_mismatch:${r.accn}`);
    filings.push({...built,provenance:{companyfacts:{path:rcf.path,sha256:rcf.sha256},submissions:{path:rsub.path,sha256:rsub.sha256},document:{path:rdoc.path,sha256:rdoc.sha256}}});
@@ -114,5 +126,5 @@ export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResu
  }
  const sample:UsSample={schema:US_SAMPLE_SCHEMA,generated_at:deps.now(),selection:'live/1',issuers};
  const final=finalUnmet(sample,picked,dd.required);
- return {sample,unmet:[...new Set([...pickUnmet,...final])],warnings};
+ return {sample,unmet:[...new Set([...pickUnmet,...final,...universeFailed])],warnings};
 }

exec
/bin/zsh -lc 'cat src/lib/dq/raw-store.ts; cat src/lib/dq/reconcile/us-sample-live.ts; cat scripts/dq/select-us-sample.ts; cat src/lib/dq/raw-dir-store.ts; cat src/lib/dq/reconcile/ixbrl.ts | head -60; cat package.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange'|'sec-companyfacts';
export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange','sec-companyfacts'];
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

export function prepare(item:RawPut):{sha256:string;path:string;meta:string}{
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
// src/lib/dq/reconcile/us-sample-live.ts
// Live generation of the US iXBRL sample manifest (spec §5.3, selection 'live/1'); the network, the companyfacts
// fetch and the RawStore are injected so the whole flow is testable offline. Rules:
//  - candidates are deduplicated by CIK BEFORE sampling (GOOG/GOOGL are one issuer); the representative is the
//    first required ticker of the CIK, else the lowest ticker; a required ticker covered by another required
//    ticker of the same CIK is satisfied by it;
//  - the exact companyfacts, submissions and primary-document bytes are retained through the RawStore BEFORE a
//    filing enters the manifest (a retention failure aborts the run) and their paths/hashes are recorded in
//    filing.provenance;
//  - the FINAL manifest (after failed issuers/filings were dropped) is re-checked: issuer count, mandatory
//    tickers, quotas, required filing coverage (10-K issuer: a 10-K and a 10-Q; 20-F issuer: a 20-F) and the
//    >= 4 keys per side (validateUsSample). Every shortfall is returned in `unmet`.
import {padCik} from '../../facts/providers/shared';
import type {RawSnapshot} from '../../facts/types';
import type {RawStore} from '../raw-store';
import {filerClass} from './pair-us-ixbrl';
import {US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,unmetQuotas} from './us-sample';
import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from './us-sample';

export interface LiveDeps{
 get(url:string):Promise<Uint8Array>;
 companyfacts(cik10:string):Promise<RawSnapshot>;
 store:RawStore;
 now():string;
}
export interface LiveInput{universe:{constituents:{ticker:string;exchange?:string}[]};required:readonly string[];n:number}
export interface LiveResult{sample:UsSample;unmet:string[];warnings:string[]}
interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}

/** Exchange names compared case-insensitively: NYSE stays upper case, Nasdaq is 'Nasdaq', others as given. */
export function normalizeExchange(x:string|null|undefined):string|null{
 const t=(x??'').trim();if(t==='')return null;
 const u=t.toUpperCase();return u==='NASDAQ'?'Nasdaq':u==='NYSE'?'NYSE':t;
}
const dec=(b:Uint8Array)=>new TextDecoder().decode(b);
function recentOf(s:Submissions):Recent[]{
 const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
 for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
 return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
}

/** One candidate per CIK. Returns the effective required list (representatives of required CIKs + required tickers not in the universe). */
export function dedupeByCik(candidates:readonly SampleCandidate[],required:readonly string[]):{candidates:SampleCandidate[];required:string[]}{
 const req=new Set(required);
 const byCik=new Map<string,SampleCandidate[]>();
 for(const c of candidates){const g=byCik.get(c.cik);if(g)g.push(c);else byCik.set(c.cik,[c]);}
 const out:SampleCandidate[]=[];const reqOut=new Set<string>();
 for(const g of byCik.values()){
  g.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
  const rep=g.find(c=>req.has(c.ticker))??g[0];
  out.push(rep);
  if(g.some(c=>req.has(c.ticker)))reqOut.add(rep.ticker);
 }
 const inUniverse=new Set(candidates.map(c=>c.ticker));
 for(const t of required)if(!inUniverse.has(t))reqOut.add(t);
 return {candidates:out,required:[...reqOut].sort()};
}

/** Shortfalls of the final manifest against what was picked (pure). */
export function finalUnmet(sample:UsSample,picked:readonly SampleCandidate[],required:readonly string[]):string[]{
 const unmet:string[]=[];
 const tickers=new Set(sample.issuers.map(i=>i.ticker));
 if(sample.issuers.length<picked.length)unmet.push(`issuers:${sample.issuers.length}/${picked.length}`);
 for(const t of required)if(!tickers.has(t))unmet.push(`required:${t}`);
 const byTicker=new Map(picked.map(p=>[p.ticker,p]));
 unmet.push(...unmetQuotas(sample.issuers.map(i=>byTicker.get(i.ticker)).filter((c):c is SampleCandidate=>c!==undefined)));
 for(const i of sample.issuers){
  const forms=new Set(i.filings.map(f=>f.form));
  for(const need of i.regime==='10-K'?['10-K','10-Q']:['20-F'])if(!forms.has(need))unmet.push(`coverage:${i.ticker}:${need}`);
 }
 return [...new Set(unmet)];
}

export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResult>{
 const json=<T>(b:Uint8Array)=>JSON.parse(dec(b)) as T;
 const tickers=json<Record<string,{cik_str:number;ticker:string}>>(await deps.get('https://www.sec.gov/files/company_tickers.json'));
 const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
 const subs=new Map<string,Submissions>();const raw:SampleCandidate[]=[];const warnings:string[]=[];const universeFailed=new Set<string>();
 for(const c of input.universe.constituents){
  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
  if(!subs.has(cik)){
   try{subs.set(cik,json<Submissions>(await deps.get(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`)));}
   catch(e){
    const m=(e as Error).message;
    if(/http_429/.test(m))throw e;   // rate limited: the universe scan cannot be trusted, fail the run
    warnings.push(`${ticker}: ${m}`);universeFailed.add(`universe_fetch:${ticker}`);continue;
   }
  }
  const s=subs.get(cik)!;
  raw.push({ticker,cik,exchange:normalizeExchange(c.exchange??s.exchanges?.[0]),fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
 }
 const dd=dedupeByCik(raw,input.required);
 const {picked,unmet:pickUnmet}=pickSample(dd.candidates,dd.required,input.n);
 const sinceYear=Number(deps.now().slice(0,4))-10;
 const issuers:SampleIssuer[]=[];
 for(const p of picked){
  // the submissions bytes are fetched again for picked issuers only: these exact bytes are parsed and retained
  const subUrl=`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`;
  const subBytes=await deps.get(subUrl);
  const s=json<Submissions>(subBytes);
  const recent=recentOf(s).filter(r=>r.inline);
  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
  const regime=annual.form as '10-K'|'20-F';
  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
  let cf:RawSnapshot;
  try{cf=await deps.companyfacts(padCik(p.cik));}catch(e){warnings.push(`${p.ticker}: companyfacts: ${(e as Error).message}`);continue;}
  const filings:SampleFiling[]=[];
  for(const r of chosen){
   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
   let doc:Uint8Array;let built:SampleFiling;
   try{
    doc=await deps.get(url);
    built=buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts:cf,doc,sinceYear});
   }catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);continue;}
   // Retain the exact bytes BEFORE the filing enters the manifest; a retention failure aborts the whole run.
   const rcf=await deps.store.put({kind:'sec-companyfacts',bytes:cf.bytes,contentType:'application/json',meta:{source_url:cf.meta.url??'',cik:p.cik}});
   const rsub=await deps.store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,cik:p.cik}});
   const rdoc=await deps.store.put({kind:'sec-document',bytes:doc,contentType:'text/html',meta:{source_url:url,accession:r.accn}});
   if(rcf.sha256!==built.raw_sha256||rdoc.sha256!==built.doc_sha256)throw new Error(`retention_hash_mismatch:${r.accn}`);
   filings.push({...built,provenance:{companyfacts:{path:rcf.path,sha256:rcf.sha256},submissions:{path:rsub.path,sha256:rsub.sha256},document:{path:rdoc.path,sha256:rdoc.sha256}}});
  }
  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
 }
 const sample:UsSample={schema:US_SAMPLE_SCHEMA,generated_at:deps.now(),selection:'live/1',issuers};
 const final=finalUnmet(sample,picked,dd.required);
 return {sample,unmet:[...new Set([...pickUnmet,...final,...universeFailed])],warnings};
}
// scripts/dq/select-us-sample.ts
/**
 * Builds the US iXBRL sample manifest (spec §5.3).
 *
 *   npx tsx scripts/dq/select-us-sample.ts --fixtures [--out src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json] [--generated-at <ISO>]
 *   node --env-file=.env.local --import tsx scripts/dq/select-us-sample.ts --live --universe <sp500 payload.json> --out <path> [--n 30]
 *
 * --fixtures (offline, deterministic): plan 2's companyfacts fixtures of AAPL and MSFT and the recorded trimmed
 * primary documents of their FY2023 10-Ks (record-ixbrl-fixture.ts) → selection 'fixture/1', sinceYear 2016.
 * doc_sha256 = the SOURCE document sha256 from the recording meta (the trimmed copy differs; the pair then marks
 * detail.right.doc_sha_mismatch); is_inline_xbrl, submissions_category and primary_document come from the
 * recorded submissions entry.
 * --live (network, never in CI; logic in reconcile/us-sample-live.ts; --raw-dir <dir> or Supabase retains the exact
 * companyfacts/submissions/document bytes, recorded in filing.provenance; a retention failure aborts): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK), deduplicated by CIK;
 * required = the US tickers of plan2.json; per candidate the submissions JSON gives fiscalYearEnd, category,
 * exchanges and recent filings; pickSample(n) applies the quotas; per picked issuer: regime = latest annual form
 * (10-K or 20-F); filings = latest inline 10-K + latest inline 10-Q, or latest inline 20-F; companyfacts and each
 * primary document are fetched and buildSampleFiling derives the keys → selection 'live/1'. A filing whose sides
 * are too small is skipped with a warning; unmet quotas are printed and give exit code 1 (the file is still
 * written for review; the FINAL manifest is re-checked for issuer count, mandatory tickers, quotas, 10-K+10-Q / 20-F coverage).
 * The manifest is validated before it is written. Exit 0 ok, 1 on failure or unmet quota, 2 on bad arguments.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {fetchCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
import {budgetFor,secPacer,snapshotOf} from '../../src/lib/facts/providers/shared';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
import type {SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
import {MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
import {liveSample} from '../../src/lib/dq/reconcile/us-sample-live';
import type {LiveInput,LiveResult} from '../../src/lib/dq/reconcile/us-sample-live';
import {rawStoreFor} from '../../src/lib/dq/raw-dir-store';

const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--raw-dir <dir>] [--n 30])';
const FIXTURE_SINCE_YEAR=2016;
const FIXTURES=[
 {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
 {ticker:'MSFT',cik:'789019',accn:'0000950170-23-035122',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
] as const;
interface RecordingMeta{source_url:string;source_sha256:string;submissions:{form:string|null;reportDate:string|null;primaryDocument:string;isInlineXBRL:boolean;category:string|null}}

function fixtureSample(generatedAt:string):UsSample{
 const issuers:SampleIssuer[]=FIXTURES.map(fx=>{
  const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as RecordingMeta;
  const filing=buildSampleFiling({cik:fx.cik,accn:fx.accn,form:meta.submissions.form??'10-K',period_end:meta.submissions.reportDate,primary_document:meta.submissions.primaryDocument,doc_url:meta.source_url,
   is_inline_xbrl:meta.submissions.isInlineXBRL,submissions_category:meta.submissions.category,companyfacts:snapshotOf(new Uint8Array(readFileSync(fx.companyfacts)),{source:'edgar'}),
   doc:new Uint8Array(readFileSync(fx.doc)),doc_sha256:meta.source_sha256,sinceYear:FIXTURE_SINCE_YEAR});
  return {cik:fx.cik,ticker:fx.ticker,regime:'10-K',filings:[filing]};
 });
 return {schema:US_SAMPLE_SCHEMA,generated_at:generatedAt,selection:'fixture/1',issuers};
}

const UA=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
async function get(url:string):Promise<Uint8Array>{
 await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});
 const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
 if(!res.ok)throw new Error(`http_${res.status} ${url}`);
 const declared=Number(res.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
 return bytes;
}
async function liveFromNetwork(universePath:string,n:number,rawDir:string):Promise<LiveResult>{
 const universe=JSON.parse(readFileSync(universePath,'utf8')) as LiveInput['universe'];
 const required=usGoldEntries(JSON.parse(readFileSync(US_GOLD_PATH,'utf8'))).entries.map(e=>e.ticker);
 return liveSample({get,companyfacts:cik10=>fetchCompanyFacts(cik10,budgetFor(120_000)),store:await rawStoreFor(rawDir),now:()=>new Date().toISOString()},{universe,required,n});
}

async function main(){
 const argv=process.argv.slice(2);let mode:''|'fixtures'|'live'='';let out='';let universe='';let rawDir='';let n=30;let generatedAt=new Date().toISOString();
 for(let i=0;i<argv.length;i++){
  const x=argv[i],v=argv[i+1];
  if(x==='--fixtures')mode='fixtures';
  else if(x==='--live')mode='live';
  else if(x==='--out'&&v){out=v;i++;}
  else if(x==='--universe'&&v){universe=v;i++;}
  else if(x==='--raw-dir'&&v){rawDir=v;i++;}
  else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)&&Number(v)>=1){n=Number(v);i++;}
  else if(x==='--generated-at'&&v&&!Number.isNaN(Date.parse(v))){generatedAt=v;i++;}
  else{console.error(USAGE);process.exit(2);}
 }
 if(mode===''||(mode==='live'&&(!universe||!out))){console.error(USAGE);process.exit(2);}
 let sample:UsSample;let unmet:string[]=[];let warnings:string[]=[];
 if(mode==='fixtures'){sample=fixtureSample(generatedAt);out||=US_SAMPLE_PATH;}
 else ({sample,unmet,warnings}=await liveFromNetwork(universe,n,rawDir));
 const v=validateUsSample(sample);
 if(!v.ok){console.error(JSON.stringify({invalid:v.errors}));process.exit(1);}
 writeFileSync(out,`${JSON.stringify(sample,null,1)}\n`);
 for(const w of warnings)console.error(`warning: ${w}`);
 console.log(JSON.stringify({out,selection:sample.selection,issuers:sample.issuers.length,filings:sample.issuers.reduce((k,i)=>k+i.filings.length,0),keys:sample.issuers.reduce((k,i)=>k+i.filings.reduce((m,f)=>m+f.expected_keys.length,0),0),unmet}));
 process.exit(unmet.length>0?1:0);
}

main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
// src/lib/dq/raw-dir-store.ts
// RawStore backed by a local directory (content-addressed files named by the RawStore path rules, never overwritten)
// and the script-side store selection shared by record-ixbrl-fixture.ts and select-us-sample.ts. Scripts only.
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {RawStoreError,memoryRawStore,prepare,rawMetaPath,supabaseRawStore} from './raw-store';
import type {RawStore} from './raw-store';

/** Content-addressed files in a directory, named by the RawStore rules; written directly (no in-memory copies), existing files are kept. */
export function dirRawStore(dir:string):RawStore{
 return {
  sha256Of:memoryRawStore().sha256Of,
  async put(item,budget){
   if(budget?.signal.aborted)throw new RawStoreError('raw_upload_failed','budget_exhausted');
   const {sha256,path,meta}=prepare(item);
   const full=join(dir,path);
   mkdirSync(dirname(full),{recursive:true});
   let status:'stored'|'exists'='stored';
   try{writeFileSync(full,item.bytes,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')status='exists';else throw e;}
   try{writeFileSync(rawMetaPath(full),meta,{flag:'wx'});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
   return {sha256,path,status};
  },
 };
}

/** --raw-dir <dir> → directory store; else the Supabase store when configured; else refuse. */
export async function rawStoreFor(rawDir:string):Promise<RawStore>{
 if(rawDir)return dirRawStore(rawDir);
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {getAdminSupabase}=await import('../supabase/admin');
  return supabaseRawStore(getAdminSupabase());
 }
 throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}
// src/lib/dq/reconcile/ixbrl.ts
// Inline XBRL subset parser (spec §5.2), IXBRL_PARSER_VERSION='ixbrl/1'.
// A bounded streaming XML tokenizer (elements, attributes, the five XML entities plus &nbsp; and numeric
// character references; comments, processing instructions and a DOCTYPE WITHOUT internal subset are
// skipped; an internal DTD subset is refused; CDATA is literal text; script/style content is raw text;
// depth <= 1000, attributes <= 256 per element) feeds a parser that resolves every element name and every
// QName value through the in-scope xmlns declarations, so prefixes never matter.
// Supported subset (each has a test); everything else lands in `unsupported` and is never merged:
//  - xbrli:context: entity/identifier; period startDate+endDate | instant, dates YYYY-MM-DD. ANY child
//    element inside segment or scenario marks the context dimensional and its facts are skipped (out of
//    scope by design, not reported). Facts carry (entity, period), so equal contexts with different ids
//    give the same key (ixFactKey) — the normalised dedupe.
//  - xbrli:unit: one measure, or divide with exactly one numerator and one denominator measure; iso4217
//    and xbrli measures become USD / shares / pure, then facts/units.ts normalizeUnit ('USD/shares' →
//    'USD/share'); anything else → unsupported(unit).
//  - ix:nonFraction: name, contextRef, unitRef, scale, sign, decimals, format, xsi:nil. Text grammar by
//    format (transformation registries 2015-02-26, 2020-02-12, 2022-02-16 only):
//      (no format), num-dot-decimal, numdotdecimal   ^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$   commas dropped
//      num-comma-decimal, numcommadecimal            ^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$    dots dropped, comma = point
//      fixed-zero, zerodash                          → 0
//      numwordsen                                    'no' | 'none' (trimmed, case-insensitive) → 0
//    any other format or no match → unsupported(format); xsi:nil = true|1 → unsupported(nil).
//    value = canonical decimal × 10^scale, negated when sign='-'. A nested ix:nonFraction gives the outer
//    fact the innermost text; text inside ix:exclude is not fact text.
//  - ix:nonNumeric: only dei:EntityFilerCategory, dei:DocumentFiscalYearFocus, dei:DocumentPeriodEndDate
//    (whitespace-collapsed raw text; a second, different text → unsupported(nonnumeric_conflict)).
//  - ix:fraction, ix:tuple and facts with tupleRef → unsupported. No ix element at all → not_inline_xbrl.
// Malformed XML throws IxbrlParseError(code); the pair turns that into unsupported results.
import {canonicalDecimal} from '../../facts/json-numbers';
import {normalizeUnit} from '../../facts/units';

export const IXBRL_PARSER_VERSION='ixbrl/1';
export const MAX_IXBRL_BYTES=50*1024*1024;
export const NS={ix:'http://www.xbrl.org/2013/inlineXBRL',xbrli:'http://www.xbrl.org/2003/instance',xbrldi:'http://xbrl.org/2006/xbrldi',xsi:'http://www.w3.org/2001/XMLSchema-instance',iso4217:'http://www.xbrl.org/2003/iso4217',xml:'http://www.w3.org/XML/1998/namespace'} as const;
export const TRANSFORM_NS:readonly string[]=['http://www.xbrl.org/inlineXBRL/transformation/2015-02-26','http://www.xbrl.org/inlineXBRL/transformation/2020-02-12','http://www.xbrl.org/inlineXBRL/transformation/2022-02-16'];
export const DEI_NON_NUMERIC:readonly string[]=['dei:EntityFilerCategory','dei:DocumentFiscalYearFocus','dei:DocumentPeriodEndDate'];

export interface IxFact{name:string;periodStart:string|null;periodEnd:string;unit:string;value:string;decimals:string|null;scale:number;entity:string;contextRef:string;unitRef:string}
export interface IxUnsupported{reason:string;name?:string;contextRef?:string;periodStart?:string|null;periodEnd?:string}
export interface IxbrlDocument{facts:IxFact[];nonNumeric:Record<string,string>;unsupported:IxUnsupported[]}
export class IxbrlParseError extends Error{constructor(public readonly code:string){super(code);this.name='IxbrlParseError';}}

// ---------------- tokenizer ----------------
export type XmlToken=
 |{t:'open';name:string;attrs:[string,string][];self:boolean;start:number;end:number}
 |{t:'close';name:string;start:number;end:number}
 |{t:'text';text:string;start:number;end:number};
const MAX_DEPTH=1000,MAX_ATTRS=256;
const NAME_RE=/[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/y;
const NAMED:Record<string,string>={lt:'<',gt:'>',amp:'&',quot:'"',apos:"'",nbsp:' '};
const fail=(code:string):never=>{throw new IxbrlParseError(code);};
const isWs=(c:number)=>c===32||c===9||c===10||c===13;
function nameAt(doc:string,at:number):string|null{NAME_RE.lastIndex=at;const m=NAME_RE.exec(doc);return m?m[0]:null;}

export function decodeEntities(s:string):string{
 if(!s.includes('&'))return s;
 return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]{0,31});/g,(m,b:string)=>{
  if(b[0]!=='#')return NAMED[b]??m;
  const cp=b[1]==='x'||b[1]==='X'?Number.parseInt(b.slice(2),16):Number.parseInt(b.slice(1),10);
  return cp>0&&cp<=0x10ffff&&(cp<0xd800||cp>0xdfff)?String.fromCodePoint(cp):m;
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
/bin/zsh -lc 'for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || cat "$d/$f"; done; done; cat src/lib/dq/reconcile/us-sample-live.test.ts | head -95; nl -ba src/lib/dq/reconcile/us-sample-live.ts | sed -n '"'97,110p'; git status --short" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
// Offline tests of the live sample generator (injected network, companyfacts and RawStore).
// The Apple fixtures stand in for every issuer; the CIK/ticker universe is synthetic where noted.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {snapshotOf} from '../../facts/providers/shared';
import {memoryRawStore} from '../raw-store';
import type {RawStore} from '../raw-store';
import {dedupeByCik,finalUnmet,liveSample,normalizeExchange} from './us-sample-live';
import type {LiveDeps} from './us-sample-live';
import {validateUsSample} from './us-sample';
import type {SampleCandidate} from './us-sample';

const enc=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
const file=(p:string)=>new Uint8Array(readFileSync(p));
const AAPL={cik:'320193',accn:'0000320193-23-000106',cf:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'};
const MSFT={cik:'789019',accn:'0000950170-23-035122',cf:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'};
const submissions=(x:typeof AAPL,primary:string)=>({category:'Large accelerated filer',fiscalYearEnd:'0930',exchanges:['Nasdaq'],filings:{recent:{accessionNumber:[x.accn],form:['10-K'],filingDate:['2023-11-03'],reportDate:['2023-09-30'],primaryDocument:[primary],isInlineXBRL:[1]}}});

function world(opts:{tickers:Record<string,string>;failCompanyfacts?:string[];failSubmissions?:Record<string,string>;store?:RawStore}){
 const store=opts.store??memoryRawStore();
 const byCik:Record<string,typeof AAPL>={[AAPL.cik]:AAPL,[MSFT.cik]:MSFT};
 const deps:LiveDeps={
  async get(url){
   if(url.endsWith('company_tickers.json'))return enc(Object.fromEntries(Object.entries(opts.tickers).map(([t,c],i)=>[String(i),{cik_str:Number(c),ticker:t}])));
   const sub=/submissions\/CIK0*(\d+)\.json$/.exec(url);
   if(sub&&opts.failSubmissions?.[sub[1]])throw new Error(opts.failSubmissions[sub[1]]);
   if(sub)return enc(submissions(byCik[sub[1]],byCik[sub[1]]===AAPL?'aapl-20230930.htm':'msft-20230630.htm'));
   const doc=/Archives\/edgar\/data\/(\d+)\//.exec(url);
   if(doc)return file(byCik[doc[1]].doc);
   throw new Error(`unexpected ${url}`);
  },
  async companyfacts(cik10){
   const c=byCik[String(Number(cik10))];
   if(opts.failCompanyfacts?.includes(c.cik))throw new Error('no_companyfacts');
   return snapshotOf(file(c.cf),{source:'edgar',url:`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`});
  },
  store,
  now:()=>'2026-11-06T00:00:00.000Z',
 };
 return {deps,store:store as ReturnType<typeof memoryRawStore>};
}
const cand=(ticker:string,cik:string):SampleCandidate=>({ticker,cik,exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated'});

describe('dedupeByCik',()=>{
 it('keeps one issuer per CIK, preferring the required ticker (GOOG/GOOGL)',()=>{
  const cs=[cand('GOOG','1652044'),cand('GOOGL','1652044'),cand('AAPL','320193')];
  expect(dedupeByCik(cs,['GOOGL']).candidates.map(c=>c.ticker)).toEqual(['GOOGL','AAPL']);
  expect(dedupeByCik(cs,['GOOGL']).required).toEqual(['GOOGL']);
  expect(dedupeByCik(cs,[]).candidates.map(c=>c.ticker)).toEqual(['GOOG','AAPL']);
  // both tickers required: the CIK is covered once; a required ticker missing from the universe stays required
  expect(dedupeByCik(cs,['GOOG','GOOGL','ZZZ']).required).toEqual(['GOOG','ZZZ']);
 });
});

describe('liveSample',()=>{
 it('samples a dual-class CIK once and retains the exact bytes with provenance',async()=>{
  const {deps,store}=world({tickers:{GOOG:AAPL.cik,GOOGL:AAPL.cik,MSFT:MSFT.cik}});
  const r=await liveSample(deps,{universe:{constituents:[{ticker:'GOOG'},{ticker:'GOOGL'},{ticker:'MSFT'}]},required:['GOOGL','MSFT'],n:30});
  expect(r.sample.issuers.map(i=>[i.ticker,i.cik])).toEqual([['GOOGL','320193'],['MSFT','789019']]);
  for(const i of r.sample.issuers)for(const f of i.filings){
   const pv=f.provenance!;
   expect(pv.companyfacts.sha256).toBe(f.raw_sha256);
   expect(pv.document.sha256).toBe(f.doc_sha256);
   for(const ref of [pv.companyfacts,pv.submissions,pv.document])expect(store.objects.has(ref.path),ref.path).toBe(true);
   expect(Buffer.from(store.objects.get(pv.document.path)!).equals(Buffer.from(file(i.cik==='320193'?AAPL.doc:MSFT.doc)))).toBe(true);
  }
  expect(validateUsSample(r.sample).ok).toBe(true);
 });

 it('re-validates the final manifest: a dropped issuer and missing 10-Q coverage are unmet',async()=>{
  const {deps}=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failCompanyfacts:[MSFT.cik]});
  const r=await liveSample(deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL','MSFT'],n:30});
  expect(r.sample.issuers.map(i=>i.ticker)).toEqual(['AAPL']);
  expect(r.unmet).toEqual(expect.arrayContaining(['issuers:1/2','required:MSFT','coverage:AAPL:10-Q']));
  expect(r.warnings.some(w=>w.startsWith('MSFT: companyfacts'))).toBe(true);
 });

 it('fails when retention fails, before any manifest is returned',async()=>{
  const bad:RawStore={sha256Of:memoryRawStore().sha256Of,put:()=>Promise.reject(new Error('raw_upload_failed'))};
  const {deps}=world({tickers:{AAPL:AAPL.cik},store:bad});
  await expect(liveSample(deps,{universe:{constituents:[{ticker:'AAPL'}]},required:['AAPL'],n:30})).rejects.toThrow('raw_upload_failed');
 });
});

describe('finalUnmet',()=>{
 it('is empty for a complete manifest and names every shortfall otherwise',()=>{
  const f=(form:string)=>({form}) as never;
  const sample={schema:'us-ixbrl-sample/1',generated_at:'x',selection:'live/1',issuers:[{cik:'1',ticker:'A',regime:'10-K',filings:[f('10-K'),f('10-Q')]},{cik:'2',ticker:'B',regime:'20-F',filings:[f('20-F')]}]} as never;
  const picked=[{...cand('A','1'),exchange:'NYSE'},{...cand('B','2'),exchange:'NYSE'}];
  expect(finalUnmet(sample,picked,['A','B']).filter(u=>!['nyse','nasdaq','fye_not_1231','not_large_accelerated'].includes(u))).toEqual([]);
  expect(finalUnmet(sample,[...picked,cand('C','3')],['A','C'])).toEqual(expect.arrayContaining(['issuers:2/3','required:C']));
 });
});

describe('universe scan and helpers',()=>{
    97	 const issuers:SampleIssuer[]=[];
    98	 for(const p of picked){
    99	  // the submissions bytes are fetched again for picked issuers only: these exact bytes are parsed and retained
   100	  const subUrl=`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`;
   101	  const subBytes=await deps.get(subUrl);
   102	  const s=json<Submissions>(subBytes);
   103	  const recent=recentOf(s).filter(r=>r.inline);
   104	  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
   105	  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
   106	  const regime=annual.form as '10-K'|'20-F';
   107	  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
   108	  let cf:RawSnapshot;
   109	  try{cf=await deps.companyfacts(padCik(p.cik));}catch(e){warnings.push(`${p.ticker}: companyfacts: ${(e as Error).message}`);continue;}
   110	  const filings:SampleFiling[]=[];
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VZdLRY00' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-RCRZZPLs' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review.md

codex
The new submissions refetch introduces an unhandled failure path that prevents partial-manifest reporting on ordinary issuer-level network failures.

Review comment:

- [P2] Handle issuer-level failures during submissions refetch — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/us-sample-live.ts:101-102
  If the initial universe fetch succeeds but this new second request times out, returns HTTP 503, or contains invalid JSON, the uncaught exception aborts the entire run. Consequently, `select-us-sample.ts` never writes the partial manifest or reports its unmet requirements, unlike failures during the universe scan, companyfacts fetch, or document fetch. Catch non-rate-limit fetch/parse failures here, record an issuer warning, and continue so `finalUnmet` can report the missing issuer; preserve the explicit abort behavior for HTTP 429.
The new submissions refetch introduces an unhandled failure path that prevents partial-manifest reporting on ordinary issuer-level network failures.

Review comment:

- [P2] Handle issuer-level failures during submissions refetch — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/us-sample-live.ts:101-102
  If the initial universe fetch succeeds but this new second request times out, returns HTTP 503, or contains invalid JSON, the uncaught exception aborts the entire run. Consequently, `select-us-sample.ts` never writes the partial manifest or reports its unmet requirements, unlike failures during the universe scan, companyfacts fetch, or document fetch. Catch non-rate-limit fetch/parse failures here, record an issuer warning, and continue so `finalUnmet` can report the missing issuer; preserve the explicit abort behavior for HTTP 429.

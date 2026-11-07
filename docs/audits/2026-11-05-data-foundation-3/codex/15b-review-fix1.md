OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b13d-a49b-7da3-ae22-0714fd9b750b
--------
user
commit ea16739
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline ea16739; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1195ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-2iJbrYCa' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jmYGiAIb' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-qyte82eK' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bxUWXHoH' (errno=Operation not permitted)
ea16739 fix(dq): live sample dedupes by CIK, re-validates the final manifest, retains raw bytes; independent key enumeration test
 scripts/dq/record-ixbrl-fixture.ts          |  32 +-------
 scripts/dq/select-us-sample.ts              |  69 ++++------------
 src/lib/dq/raw-dir-store.ts                 |  35 +++++++++
 src/lib/dq/raw-store.ts                     |   4 +-
 src/lib/dq/reconcile/us-sample-live.test.ts |  92 ++++++++++++++++++++++
 src/lib/dq/reconcile/us-sample-live.ts      | 118 ++++++++++++++++++++++++++++
 src/lib/dq/reconcile/us-sample-v1.test.ts   |  54 ++++++++++++-
 src/lib/dq/reconcile/us-sample.ts           |  19 ++++-
 8 files changed, 336 insertions(+), 87 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if test -f "$p"; then echo "$p"; cat "$p"; fi; done; git show ea16739 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
reports
scripts
skills
src
supabase
tailwind.config.ts
tsconfig.json
tsconfig.tsbuildinfo
vendor
vercel.json
vitest.config.ts
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3byWDY68' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-o5YRVe2x' (errno=Operation not permitted)
commit ea1673986e6988484883acc5a0777326c16ba1ed
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:22:35 2026 -0800

    fix(dq): live sample dedupes by CIK, re-validates the final manifest, retains raw bytes; independent key enumeration test
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/record-ixbrl-fixture.ts b/scripts/dq/record-ixbrl-fixture.ts
index 5a8ef57..fbd058d 100644
--- a/scripts/dq/record-ixbrl-fixture.ts
+++ b/scripts/dq/record-ixbrl-fixture.ts
@@ -22,11 +22,9 @@
  * written only after both downloads, their retention and the trim succeeded. Exit 1 on failure, 2 on bad arguments.
  */
 import {createHash} from 'node:crypto';
-import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
-import {dirname,join} from 'node:path';
+import {writeFileSync} from 'node:fs';
 import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
-import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
-import type {RawStore} from '../../src/lib/dq/raw-store';
+import {rawStoreFor} from '../../src/lib/dq/raw-dir-store';
 import {budgetFor,secPacer} from '../../src/lib/facts/providers/shared';
 import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
 import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from '../../src/lib/dq/reconcile/ixbrl-trim';
@@ -45,32 +43,6 @@ async function get(url:string):Promise<Uint8Array>{
  return bytes;
 }
 
-/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
-function dirRawStore(dir:string):RawStore{
- const mem=memoryRawStore();
- return {
-  sha256Of:mem.sha256Of,
-  async put(item,budget){
-   const r=await mem.put(item,budget);
-   for(const [p,bytes] of mem.objects){
-    const full=join(dir,p);
-    if(existsSync(full))continue;
-    mkdirSync(dirname(full),{recursive:true});
-    writeFileSync(full,bytes,{flag:'wx'});
-   }
-   return r;
-  },
- };
-}
-async function rawStoreFor(rawDir:string):Promise<RawStore>{
- if(rawDir)return dirRawStore(rawDir);
- if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
-  const {getAdminSupabase}=await import('../../src/lib/supabase/admin');
-  return supabaseRawStore(getAdminSupabase());
- }
- throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
-}
-
 async function main(){
  const argv=process.argv.slice(2);let cik='',accn='',out='',rawDir='';
  for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(v===''){console.error(USAGE);process.exit(2);}if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
diff --git a/scripts/dq/select-us-sample.ts b/scripts/dq/select-us-sample.ts
index 5d994f0..912b2ef 100644
--- a/scripts/dq/select-us-sample.ts
+++ b/scripts/dq/select-us-sample.ts
@@ -10,25 +10,28 @@
  * doc_sha256 = the SOURCE document sha256 from the recording meta (the trimmed copy differs; the pair then marks
  * detail.right.doc_sha_mismatch); is_inline_xbrl, submissions_category and primary_document come from the
  * recorded submissions entry.
- * --live (network, never in CI): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK);
+ * --live (network, never in CI; logic in reconcile/us-sample-live.ts; --raw-dir <dir> or Supabase retains the exact
+ * companyfacts/submissions/document bytes, recorded in filing.provenance; a retention failure aborts): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK), deduplicated by CIK;
  * required = the US tickers of plan2.json; per candidate the submissions JSON gives fiscalYearEnd, category,
  * exchanges and recent filings; pickSample(n) applies the quotas; per picked issuer: regime = latest annual form
  * (10-K or 20-F); filings = latest inline 10-K + latest inline 10-Q, or latest inline 20-F; companyfacts and each
  * primary document are fetched and buildSampleFiling derives the keys → selection 'live/1'. A filing whose sides
  * are too small is skipped with a warning; unmet quotas are printed and give exit code 1 (the file is still
- * written for review).
+ * written for review; the FINAL manifest is re-checked for issuer count, mandatory tickers, quotas, 10-K+10-Q / 20-F coverage).
  * The manifest is validated before it is written. Exit 0 ok, 1 on failure or unmet quota, 2 on bad arguments.
  */
 import {readFileSync,writeFileSync} from 'node:fs';
 import {fetchCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
-import {budgetFor,padCik,snapshotOf} from '../../src/lib/facts/providers/shared';
+import {budgetFor,secPacer,snapshotOf} from '../../src/lib/facts/providers/shared';
 import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
-import {filerClass} from '../../src/lib/dq/reconcile/pair-us-ixbrl';
 import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
-import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
-import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
+import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
+import type {SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
+import {liveSample} from '../../src/lib/dq/reconcile/us-sample-live';
+import type {LiveInput,LiveResult} from '../../src/lib/dq/reconcile/us-sample-live';
+import {rawStoreFor} from '../../src/lib/dq/raw-dir-store';
 
-const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--n 30])';
+const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> --raw-dir <dir> [--n 30])';
 const FIXTURE_SINCE_YEAR=2016;
 const FIXTURES=[
  {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
@@ -48,65 +51,27 @@ function fixtureSample(generatedAt:string):UsSample{
 }
 
 const UA=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
-const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 async function get(url:string):Promise<Uint8Array>{
- await pause(150);
+ await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});
  const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
  if(!res.ok)throw new Error(`http_${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
 }
-const json=async<T>(url:string)=>JSON.parse(new TextDecoder().decode(await get(url))) as T;
-interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
-interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}
-function recentOf(s:Submissions):Recent[]{
- const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
- for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
- return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
-}
-
-async function liveSample(universePath:string,n:number):Promise<{sample:UsSample;unmet:string[];warnings:string[]}>{
- const universe=JSON.parse(readFileSync(universePath,'utf8')) as {constituents:{ticker:string;exchange?:string}[]};
- const tickers=await json<Record<string,{cik_str:number;ticker:string}>>('https://www.sec.gov/files/company_tickers.json');
- const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
+async function liveFromNetwork(universePath:string,n:number,rawDir:string):Promise<LiveResult>{
+ const universe=JSON.parse(readFileSync(universePath,'utf8')) as LiveInput['universe'];
  const required=usGoldEntries(JSON.parse(readFileSync(US_GOLD_PATH,'utf8'))).entries.map(e=>e.ticker);
- const subs=new Map<string,Submissions>();const candidates:SampleCandidate[]=[];const warnings:string[]=[];
- for(const c of universe.constituents){
-  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
-  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
-  const s=await json<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`).catch(e=>{warnings.push(`${ticker}: ${(e as Error).message}`);return null;});
-  if(!s)continue;
-  subs.set(cik,s);
-  candidates.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
- }
- const {picked,unmet}=pickSample(candidates,required,n);
- const sinceYear=new Date().getUTCFullYear()-10;
- const issuers:SampleIssuer[]=[];
- for(const p of picked){
-  const s=subs.get(p.cik)!;const recent=recentOf(s).filter(r=>r.inline);
-  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
-  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
-  const regime=annual.form as '10-K'|'20-F';
-  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
-  const companyfacts=await fetchCompanyFacts(padCik(p.cik),budgetFor(120_000));
-  const filings:SampleFiling[]=[];
-  for(const r of chosen){
-   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
-   try{filings.push(buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts,doc:await get(url),sinceYear}));}
-   catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);}
-  }
-  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
- }
- return {sample:{schema:US_SAMPLE_SCHEMA,generated_at:new Date().toISOString(),selection:'live/1',issuers},unmet,warnings};
+ return liveSample({get,companyfacts:cik10=>fetchCompanyFacts(cik10,budgetFor(120_000)),store:await rawStoreFor(rawDir),now:()=>new Date().toISOString()},{universe,required,n});
 }
 
 async function main(){
- const argv=process.argv.slice(2);let mode:''|'fixtures'|'live'='';let out='';let universe='';let n=30;let generatedAt=new Date().toISOString();
+ const argv=process.argv.slice(2);let mode:''|'fixtures'|'live'='';let out='';let universe='';let rawDir='';let n=30;let generatedAt=new Date().toISOString();
  for(let i=0;i<argv.length;i++){
   const x=argv[i],v=argv[i+1];
   if(x==='--fixtures')mode='fixtures';
   else if(x==='--live')mode='live';
   else if(x==='--out'&&v){out=v;i++;}
   else if(x==='--universe'&&v){universe=v;i++;}
+  else if(x==='--raw-dir'&&v){rawDir=v;i++;}
   else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)){n=Number(v);i++;}
   else if(x==='--generated-at'&&v&&!Number.isNaN(Date.parse(v))){generatedAt=v;i++;}
   else{console.error(USAGE);process.exit(2);}
@@ -114,7 +79,7 @@ async function main(){
  if(mode===''||(mode==='live'&&(!universe||!out))){console.error(USAGE);process.exit(2);}
  let sample:UsSample;let unmet:string[]=[];let warnings:string[]=[];
  if(mode==='fixtures'){sample=fixtureSample(generatedAt);out||=US_SAMPLE_PATH;}
- else ({sample,unmet,warnings}=await liveSample(universe,n));
+ else ({sample,unmet,warnings}=await liveFromNetwork(universe,n,rawDir));
  const v=validateUsSample(sample);
  if(!v.ok){console.error(JSON.stringify({invalid:v.errors}));process.exit(1);}
  writeFileSync(out,`${JSON.stringify(sample,null,1)}\n`);
diff --git a/src/lib/dq/raw-dir-store.ts b/src/lib/dq/raw-dir-store.ts
new file mode 100644
index 0000000..6cb632e
--- /dev/null
+++ b/src/lib/dq/raw-dir-store.ts
@@ -0,0 +1,35 @@
+// src/lib/dq/raw-dir-store.ts
+// RawStore backed by a local directory (content-addressed files named by the RawStore path rules, never overwritten)
+// and the script-side store selection shared by record-ixbrl-fixture.ts and select-us-sample.ts. Scripts only.
+import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
+import {dirname,join} from 'node:path';
+import {memoryRawStore,supabaseRawStore} from './raw-store';
+import type {RawStore} from './raw-store';
+
+/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
+export function dirRawStore(dir:string):RawStore{
+ const mem=memoryRawStore();
+ return {
+  sha256Of:mem.sha256Of,
+  async put(item,budget){
+   const r=await mem.put(item,budget);
+   for(const [p,bytes] of mem.objects){
+    const full=join(dir,p);
+    if(existsSync(full))continue;
+    mkdirSync(dirname(full),{recursive:true});
+    writeFileSync(full,bytes,{flag:'wx'});
+   }
+   return r;
+  },
+ };
+}
+
+/** --raw-dir <dir> → directory store; else the Supabase store when configured; else refuse. */
+export async function rawStoreFor(rawDir:string):Promise<RawStore>{
+ if(rawDir)return dirRawStore(rawDir);
+ if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
+  const {getAdminSupabase}=await import('../supabase/admin');
+  return supabaseRawStore(getAdminSupabase());
+ }
+ throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
+}
diff --git a/src/lib/dq/raw-store.ts b/src/lib/dq/raw-store.ts
index 6d3390b..2071da2 100644
--- a/src/lib/dq/raw-store.ts
+++ b/src/lib/dq/raw-store.ts
@@ -12,8 +12,8 @@ import type {SupabaseClient} from '@supabase/supabase-js';
 import type {Budget} from '../facts/types';
 
 export const RECONCILE_RAW_BUCKET='reconcile-raw';
-export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange';
-export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange'];
+export type RawKind='sec-submissions'|'sec-document'|'openfigi'|'gleif'|'hkex'|'tushare-disclosure'|'cn-gold-pdf'|'cninfo'|'sec-tickers-exchange'|'sec-companyfacts';
+export const RAW_KINDS:readonly RawKind[]=['sec-submissions','sec-document','openfigi','gleif','hkex','tushare-disclosure','cn-gold-pdf','cninfo','sec-tickers-exchange','sec-companyfacts'];
 export type RawContentType='application/json'|'text/html'|'application/pdf'|'text/csv'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'application/zip';
 export interface RawPut{kind:RawKind;bytes:Uint8Array;contentType:RawContentType;meta?:Record<string,string|number>}
 export interface RawStored{sha256:string;path:string;status:'stored'|'exists'}
diff --git a/src/lib/dq/reconcile/us-sample-live.test.ts b/src/lib/dq/reconcile/us-sample-live.test.ts
new file mode 100644
index 0000000..381ac76
--- /dev/null
+++ b/src/lib/dq/reconcile/us-sample-live.test.ts
@@ -0,0 +1,92 @@
+// Offline tests of the live sample generator (injected network, companyfacts and RawStore).
+// The Apple fixtures stand in for every issuer; the CIK/ticker universe is synthetic where noted.
+import {readFileSync} from 'node:fs';
+import {describe,expect,it} from 'vitest';
+import {snapshotOf} from '../../facts/providers/shared';
+import {memoryRawStore} from '../raw-store';
+import type {RawStore} from '../raw-store';
+import {dedupeByCik,finalUnmet,liveSample} from './us-sample-live';
+import type {LiveDeps} from './us-sample-live';
+import {validateUsSample} from './us-sample';
+import type {SampleCandidate} from './us-sample';
+
+const enc=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x));
+const file=(p:string)=>new Uint8Array(readFileSync(p));
+const AAPL={cik:'320193',accn:'0000320193-23-000106',cf:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'};
+const MSFT={cik:'789019',accn:'0000950170-23-035122',cf:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'};
+const submissions=(x:typeof AAPL,primary:string)=>({category:'Large accelerated filer',fiscalYearEnd:'0930',exchanges:['Nasdaq'],filings:{recent:{accessionNumber:[x.accn],form:['10-K'],filingDate:['2023-11-03'],reportDate:['2023-09-30'],primaryDocument:[primary],isInlineXBRL:[1]}}});
+
+function world(opts:{tickers:Record<string,string>;failCompanyfacts?:string[];store?:RawStore}){
+ const store=opts.store??memoryRawStore();
+ const byCik:Record<string,typeof AAPL>={[AAPL.cik]:AAPL,[MSFT.cik]:MSFT};
+ const deps:LiveDeps={
+  async get(url){
+   if(url.endsWith('company_tickers.json'))return enc(Object.fromEntries(Object.entries(opts.tickers).map(([t,c],i)=>[String(i),{cik_str:Number(c),ticker:t}])));
+   const sub=/submissions\/CIK0*(\d+)\.json$/.exec(url);
+   if(sub)return enc(submissions(byCik[sub[1]],byCik[sub[1]]===AAPL?'aapl-20230930.htm':'msft-20230630.htm'));
+   const doc=/Archives\/edgar\/data\/(\d+)\//.exec(url);
+   if(doc)return file(byCik[doc[1]].doc);
+   throw new Error(`unexpected ${url}`);
+  },
+  async companyfacts(cik10){
+   const c=byCik[String(Number(cik10))];
+   if(opts.failCompanyfacts?.includes(c.cik))throw new Error('no_companyfacts');
+   return snapshotOf(file(c.cf),{source:'edgar',url:`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`});
+  },
+  store,
+  now:()=>'2026-11-06T00:00:00.000Z',
+ };
+ return {deps,store:store as ReturnType<typeof memoryRawStore>};
+}
+const cand=(ticker:string,cik:string):SampleCandidate=>({ticker,cik,exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated'});
+
+describe('dedupeByCik',()=>{
+ it('keeps one issuer per CIK, preferring the required ticker (GOOG/GOOGL)',()=>{
+  const cs=[cand('GOOG','1652044'),cand('GOOGL','1652044'),cand('AAPL','320193')];
+  expect(dedupeByCik(cs,['GOOGL']).candidates.map(c=>c.ticker)).toEqual(['GOOGL','AAPL']);
+  expect(dedupeByCik(cs,['GOOGL']).required).toEqual(['GOOGL']);
+  expect(dedupeByCik(cs,[]).candidates.map(c=>c.ticker)).toEqual(['GOOG','AAPL']);
+  // both tickers required: the CIK is covered once; a required ticker missing from the universe stays required
+  expect(dedupeByCik(cs,['GOOG','GOOGL','ZZZ']).required).toEqual(['GOOG','ZZZ']);
+ });
+});
+
+describe('liveSample',()=>{
+ it('samples a dual-class CIK once and retains the exact bytes with provenance',async()=>{
+  const {deps,store}=world({tickers:{GOOG:AAPL.cik,GOOGL:AAPL.cik,MSFT:MSFT.cik}});
+  const r=await liveSample(deps,{universe:{constituents:[{ticker:'GOOG'},{ticker:'GOOGL'},{ticker:'MSFT'}]},required:['GOOGL','MSFT'],n:30});
+  expect(r.sample.issuers.map(i=>[i.ticker,i.cik])).toEqual([['GOOGL','320193'],['MSFT','789019']]);
+  for(const i of r.sample.issuers)for(const f of i.filings){
+   const pv=f.provenance!;
+   expect(pv.companyfacts.sha256).toBe(f.raw_sha256);
+   expect(pv.document.sha256).toBe(f.doc_sha256);
+   for(const ref of [pv.companyfacts,pv.submissions,pv.document])expect(store.objects.has(ref.path),ref.path).toBe(true);
+   expect(Buffer.from(store.objects.get(pv.document.path)!).equals(Buffer.from(file(i.cik==='320193'?AAPL.doc:MSFT.doc)))).toBe(true);
+  }
+  expect(validateUsSample(r.sample).ok).toBe(true);
+ });
+
+ it('re-validates the final manifest: a dropped issuer and missing 10-Q coverage are unmet',async()=>{
+  const {deps}=world({tickers:{AAPL:AAPL.cik,MSFT:MSFT.cik},failCompanyfacts:[MSFT.cik]});
+  const r=await liveSample(deps,{universe:{constituents:[{ticker:'AAPL'},{ticker:'MSFT'}]},required:['AAPL','MSFT'],n:30});
+  expect(r.sample.issuers.map(i=>i.ticker)).toEqual(['AAPL']);
+  expect(r.unmet).toEqual(expect.arrayContaining(['issuers:1/2','required:MSFT','coverage:AAPL:10-Q']));
+  expect(r.warnings.some(w=>w.startsWith('MSFT: companyfacts'))).toBe(true);
+ });
+
+ it('fails when retention fails, before any manifest is returned',async()=>{
+  const bad:RawStore={sha256Of:memoryRawStore().sha256Of,put:()=>Promise.reject(new Error('raw_upload_failed'))};
+  const {deps}=world({tickers:{AAPL:AAPL.cik},store:bad});
+  await expect(liveSample(deps,{universe:{constituents:[{ticker:'AAPL'}]},required:['AAPL'],n:30})).rejects.toThrow('raw_upload_failed');
+ });
+});
+
+describe('finalUnmet',()=>{
+ it('is empty for a complete manifest and names every shortfall otherwise',()=>{
+  const f=(form:string)=>({form}) as never;
+  const sample={schema:'us-ixbrl-sample/1',generated_at:'x',selection:'live/1',issuers:[{cik:'1',ticker:'A',regime:'10-K',filings:[f('10-K'),f('10-Q')]},{cik:'2',ticker:'B',regime:'20-F',filings:[f('20-F')]}]} as never;
+  const picked=[{...cand('A','1'),exchange:'NYSE'},{...cand('B','2'),exchange:'NYSE'}];
+  expect(finalUnmet(sample,picked,['A','B']).filter(u=>!['nyse','nasdaq','fye_not_1231','not_large_accelerated'].includes(u))).toEqual([]);
+  expect(finalUnmet(sample,[...picked,cand('C','3')],['A','C'])).toEqual(expect.arrayContaining(['issuers:2/3','required:C']));
+ });
+});
diff --git a/src/lib/dq/reconcile/us-sample-live.ts b/src/lib/dq/reconcile/us-sample-live.ts
new file mode 100644
index 0000000..9a315fb
--- /dev/null
+++ b/src/lib/dq/reconcile/us-sample-live.ts
@@ -0,0 +1,118 @@
+// src/lib/dq/reconcile/us-sample-live.ts
+// Live generation of the US iXBRL sample manifest (spec §5.3, selection 'live/1'); the network, the companyfacts
+// fetch and the RawStore are injected so the whole flow is testable offline. Rules:
+//  - candidates are deduplicated by CIK BEFORE sampling (GOOG/GOOGL are one issuer); the representative is the
+//    first required ticker of the CIK, else the lowest ticker; a required ticker covered by another required
+//    ticker of the same CIK is satisfied by it;
+//  - the exact companyfacts, submissions and primary-document bytes are retained through the RawStore BEFORE a
+//    filing enters the manifest (a retention failure aborts the run) and their paths/hashes are recorded in
+//    filing.provenance;
+//  - the FINAL manifest (after failed issuers/filings were dropped) is re-checked: issuer count, mandatory
+//    tickers, quotas, required filing coverage (10-K issuer: a 10-K and a 10-Q; 20-F issuer: a 20-F) and the
+//    >= 4 keys per side (validateUsSample). Every shortfall is returned in `unmet`.
+import {padCik} from '../../facts/providers/shared';
+import type {RawSnapshot} from '../../facts/types';
+import type {RawStore} from '../raw-store';
+import {filerClass} from './pair-us-ixbrl';
+import {US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,unmetQuotas} from './us-sample';
+import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from './us-sample';
+
+export interface LiveDeps{
+ get(url:string):Promise<Uint8Array>;
+ companyfacts(cik10:string):Promise<RawSnapshot>;
+ store:RawStore;
+ now():string;
+}
+export interface LiveInput{universe:{constituents:{ticker:string;exchange?:string}[]};required:readonly string[];n:number}
+export interface LiveResult{sample:UsSample;unmet:string[];warnings:string[]}
+interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
+interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}
+
+const dec=(b:Uint8Array)=>new TextDecoder().decode(b);
+function recentOf(s:Submissions):Recent[]{
+ const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
+ for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
+ return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
+}
+
+/** One candidate per CIK. Returns the effective required list (representatives of required CIKs + required tickers not in the universe). */
+export function dedupeByCik(candidates:readonly SampleCandidate[],required:readonly string[]):{candidates:SampleCandidate[];required:string[]}{
+ const req=new Set(required);
+ const byCik=new Map<string,SampleCandidate[]>();
+ for(const c of candidates){const g=byCik.get(c.cik);if(g)g.push(c);else byCik.set(c.cik,[c]);}
+ const out:SampleCandidate[]=[];const reqOut=new Set<string>();
+ for(const g of byCik.values()){
+  g.sort((a,b)=>a.ticker<b.ticker?-1:a.ticker>b.ticker?1:0);
+  const rep=g.find(c=>req.has(c.ticker))??g[0];
+  out.push(rep);
+  if(g.some(c=>req.has(c.ticker)))reqOut.add(rep.ticker);
+ }
+ const inUniverse=new Set(candidates.map(c=>c.ticker));
+ for(const t of required)if(!inUniverse.has(t))reqOut.add(t);
+ return {candidates:out,required:[...reqOut].sort()};
+}
+
+/** Shortfalls of the final manifest against what was picked (pure). */
+export function finalUnmet(sample:UsSample,picked:readonly SampleCandidate[],required:readonly string[]):string[]{
+ const unmet:string[]=[];
+ const tickers=new Set(sample.issuers.map(i=>i.ticker));
+ if(sample.issuers.length<picked.length)unmet.push(`issuers:${sample.issuers.length}/${picked.length}`);
+ for(const t of required)if(!tickers.has(t))unmet.push(`required:${t}`);
+ const byTicker=new Map(picked.map(p=>[p.ticker,p]));
+ unmet.push(...unmetQuotas(sample.issuers.map(i=>byTicker.get(i.ticker)).filter((c):c is SampleCandidate=>c!==undefined)));
+ for(const i of sample.issuers){
+  const forms=new Set(i.filings.map(f=>f.form));
+  for(const need of i.regime==='10-K'?['10-K','10-Q']:['20-F'])if(!forms.has(need))unmet.push(`coverage:${i.ticker}:${need}`);
+ }
+ return [...new Set(unmet)];
+}
+
+export async function liveSample(deps:LiveDeps,input:LiveInput):Promise<LiveResult>{
+ const json=<T>(b:Uint8Array)=>JSON.parse(dec(b)) as T;
+ const tickers=json<Record<string,{cik_str:number;ticker:string}>>(await deps.get('https://www.sec.gov/files/company_tickers.json'));
+ const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
+ const subs=new Map<string,{bytes:Uint8Array;parsed:Submissions}>();const raw:SampleCandidate[]=[];const warnings:string[]=[];
+ for(const c of input.universe.constituents){
+  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
+  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
+  if(!subs.has(cik)){
+   try{const bytes=await deps.get(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);subs.set(cik,{bytes,parsed:json<Submissions>(bytes)});}
+   catch(e){warnings.push(`${ticker}: ${(e as Error).message}`);continue;}
+  }
+  const s=subs.get(cik)!.parsed;
+  raw.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
+ }
+ const dd=dedupeByCik(raw,input.required);
+ const {picked,unmet:pickUnmet}=pickSample(dd.candidates,dd.required,input.n);
+ const sinceYear=Number(deps.now().slice(0,4))-10;
+ const issuers:SampleIssuer[]=[];
+ for(const p of picked){
+  const {bytes:subBytes,parsed:s}=subs.get(p.cik)!;
+  const recent=recentOf(s).filter(r=>r.inline);
+  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
+  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
+  const regime=annual.form as '10-K'|'20-F';
+  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
+  let cf:RawSnapshot;
+  try{cf=await deps.companyfacts(padCik(p.cik));}catch(e){warnings.push(`${p.ticker}: companyfacts: ${(e as Error).message}`);continue;}
+  const filings:SampleFiling[]=[];
+  for(const r of chosen){
+   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
+   let doc:Uint8Array;let built:SampleFiling;
+   try{
+    doc=await deps.get(url);
+    built=buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts:cf,doc,sinceYear});
+   }catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);continue;}
+   // Retain the exact bytes BEFORE the filing enters the manifest; a retention failure aborts the whole run.
+   const rcf=await deps.store.put({kind:'sec-companyfacts',bytes:cf.bytes,contentType:'application/json',meta:{source_url:cf.meta.url??'',cik:p.cik}});
+   const rsub=await deps.store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:`https://data.sec.gov/submissions/CIK${padCik(p.cik)}.json`,cik:p.cik}});
+   const rdoc=await deps.store.put({kind:'sec-document',bytes:doc,contentType:'text/html',meta:{source_url:url,accession:r.accn}});
+   if(rcf.sha256!==built.raw_sha256||rdoc.sha256!==built.doc_sha256)throw new Error(`retention_hash_mismatch:${r.accn}`);
+   filings.push({...built,provenance:{companyfacts:{path:rcf.path,sha256:rcf.sha256},submissions:{path:rsub.path,sha256:rsub.sha256},document:{path:rdoc.path,sha256:rdoc.sha256}}});
+  }
+  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
+ }
+ const sample:UsSample={schema:US_SAMPLE_SCHEMA,generated_at:deps.now(),selection:'live/1',issuers};
+ const final=finalUnmet(sample,picked,dd.required);
+ return {sample,unmet:[...new Set([...pickUnmet,...final])],warnings};
+}
diff --git a/src/lib/dq/reconcile/us-sample-v1.test.ts b/src/lib/dq/reconcile/us-sample-v1.test.ts
index 460af51..bb8c871 100644
--- a/src/lib/dq/reconcile/us-sample-v1.test.ts
+++ b/src/lib/dq/reconcile/us-sample-v1.test.ts
@@ -5,11 +5,13 @@
 // us-ixbrl-sample-v1.exceptions.json. This is the cheap pre-check of the "all passed" assertion of
 // ixbrl-pair.integration.test.ts; an exception is never added to make a test pass, only to register an
 // explained, real discrepancy (each one is also written up in the E4 audit note).
+import {createHash} from 'node:crypto';
 import {readFileSync} from 'node:fs';
 import {describe,expect,it} from 'vitest';
-import {conceptById} from '../../facts/concepts';
+import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
 import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
 import {snapshotOf} from '../../facts/providers/shared';
+import {unitKindOf} from '../../facts/units';
 import {compareDecimal} from './decimal';
 import {indexIxFacts,parseInlineXbrl} from './ixbrl';
 import {US_SAMPLE_PATH,entityIs,usNaturalKey,validateUsSample} from './us-sample';
@@ -58,3 +60,53 @@ describe('us-ixbrl-sample-v1 (fixture sample, offline)',()=>{
   expect(found).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})));
  });
 });
+
+// Independent enumeration of the two source key sets (does not use us-sample.ts helpers): the companyfacts adapter on
+// the plan-2 fixture (candidates + ambiguous + odd-duration of the accession) and the iXBRL parser on the recorded
+// trimmed document (filer entity, known tag, unit kind and period nature of the concept, period end >= 2016-01-01,
+// highest-priority tag per key).
+describe('us-ixbrl-sample-v1 expected keys equal the union of both sources',()=>{
+ const sha=(b:Uint8Array|Buffer)=>createHash('sha256').update(b).digest('hex');
+ const v=validateUsSample(JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')));
+ const kk=(c:string,s:string|null,e:string,u:string)=>`${c}|${s??''}|${e}|${u}`;
+ it('has exactly the union keys with the right origins and source concepts',()=>{
+  if(!v.ok)throw new Error('invalid sample');
+  for(const iss of v.sample.issuers)for(const f of iss.filings){
+   const fx=FIXTURE[f.accn];
+   const parse=parseCompanyFacts(snapshotOf(new Uint8Array(read(fx.companyfacts)),{source:'edgar'}),{sinceYear:2016});
+   const left=new Map<string,string>();
+   for(const c of [...parse.candidates,...parse.ambiguous.flatMap(a=>a.candidates),...parse.oddDuration])if(c.filingRef===f.accn)left.set(kk(c.concept,c.periodStart,c.periodEnd,c.unit),c.sourceConcept);
+   const doc=parseInlineXbrl(read(fx.doc).toString('utf8'));
+   const right=new Map<string,string>();
+   for(const x of doc.facts){
+    if(!entityIs(x.entity,iss.cik)||x.periodEnd<'2016-01-01')continue;
+    const def=FACT_CONCEPTS.find(c=>tagsOf(c).includes(x.name));
+    if(!def||unitKindOf(x.unit)!==def.unitKind||(def.nature==='duration')!==(x.periodStart!==null))continue;
+    // the first concept (registry order) that lists the tag owns it
+    const k=kk(def.id,x.periodStart,x.periodEnd,x.unit);
+    const prev=right.get(k);
+    if(prev===undefined||tagsOf(def).indexOf(x.name)<tagsOf(def).indexOf(prev))right.set(k,x.name);
+   }
+   const expected=new Map<string,{origin:string;source:string}>();
+   for(const [k,src] of left)expected.set(k,{origin:right.has(k)?'both':'left',source:src});
+   for(const [k,src] of right)if(!left.has(k))expected.set(k,{origin:'right',source:src});
+   const actual=new Map(f.expected_keys.map(k=>[kk(k.concept,k.period_start,k.period_end,k.unit),{origin:k.origin,source:k.source_concept}]));
+   expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
+   for(const [k,e] of expected)expect(actual.get(k),k).toEqual(e);
+   expect(f.expected_keys.length).toBe(expected.size);
+  }
+ });
+ it('fixture and manifest hashes match the files and recording metas',()=>{
+  if(!v.ok)throw new Error('invalid sample');
+  for(const iss of v.sample.issuers)for(const f of iss.filings){
+   const fx=FIXTURE[f.accn];
+   const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as {source_url:string;source_sha256:string;trimmed_sha256:string;submissions:{accession:string;primaryDocument:string}};
+   expect(f.raw_sha256).toBe(sha(read(fx.companyfacts)));
+   expect(f.doc_sha256).toBe(meta.source_sha256);
+   expect(f.doc_url).toBe(meta.source_url);
+   expect(meta.trimmed_sha256).toBe(sha(read(fx.doc)));
+   expect(meta.submissions.accession).toBe(f.accn);
+   expect(f.primary_document).toBe(meta.submissions.primaryDocument);
+  }
+ });
+});
diff --git a/src/lib/dq/reconcile/us-sample.ts b/src/lib/dq/reconcile/us-sample.ts
index 89f0ddd..eb20642 100644
--- a/src/lib/dq/reconcile/us-sample.ts
+++ b/src/lib/dq/reconcile/us-sample.ts
@@ -22,7 +22,10 @@ export const US_SAMPLE_PATH='src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json';
 export const MIN_KEYS_PER_SIDE=4;
 export type KeyOrigin='left'|'right'|'both';
 export interface SampleKey{concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:KeyOrigin}
-export interface SampleFiling{accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
+export interface RawRef{path:string;sha256:string}
+/** Live samples: where the exact bytes the keys were derived from were retained (RawStore paths). */
+export interface SampleProvenance{companyfacts:RawRef;submissions:RawRef;document:RawRef}
+export interface SampleFiling{provenance?:SampleProvenance;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
 export interface SampleIssuer{cik:string;ticker:string;regime:'10-K'|'20-F';filings:SampleFiling[]}
 export interface UsSample{schema:typeof US_SAMPLE_SCHEMA;generated_at:string;selection:string;issuers:SampleIssuer[]}
 type KeyCore=Omit<SampleKey,'origin'>;
@@ -94,6 +97,16 @@ export function validateUsSample(json:unknown):{ok:true;sample:UsSample}|{ok:fal
    if(f?.submissions_category!==null&&typeof f?.submissions_category!=='string')e(`${fa}.submissions_category`);
    if(typeof f?.raw_sha256!=='string'||!SHA.test(f.raw_sha256))e(`${fa}.raw_sha256`);
    if(typeof f?.doc_sha256!=='string'||!SHA.test(f.doc_sha256))e(`${fa}.doc_sha256`);
+   if(f?.provenance!==undefined){
+    const pv=f.provenance as Partial<SampleProvenance>|null;
+    const ref=(r:unknown,kind:string,sha:unknown)=>{const x=r as Partial<RawRef>|null;return !!x&&typeof x.path==='string'&&typeof x.sha256==='string'&&SHA.test(x.sha256)&&x.path.startsWith(`${kind}/${x.sha256}.`)&&x.sha256===sha;};
+    if(!pv||typeof pv!=='object')e(`${fa}.provenance`);
+    else{
+     if(!ref(pv.companyfacts,'sec-companyfacts',f.raw_sha256))e(`${fa}.provenance.companyfacts`);
+     if(!ref(pv.document,'sec-document',f.doc_sha256))e(`${fa}.provenance.document`);
+     if(!ref(pv.submissions,'sec-submissions',(pv.submissions as Partial<RawRef>|undefined)?.sha256))e(`${fa}.provenance.submissions`);
+    }
+   }
    if(!Array.isArray(f?.expected_keys)){e(`${fa}.expected_keys`);return;}
    let nl=0,nr=0;
    f.expected_keys.forEach((k,ki)=>{
@@ -141,5 +154,7 @@ export function pickSample(candidates:readonly SampleCandidate[],required:readon
   }
  }
  const missing=[...req].filter(t=>!picked.some(p=>p.ticker===t)).sort().map(t=>`required:${t}`);
- return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)]};
+ return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...unmetQuotas(picked)]};
 }
+/** Names of the quotas a set of issuers does not meet (used for the pick and again on the final manifest). */
+export const unmetQuotas=(set:readonly SampleCandidate[]):string[]=>QUOTAS.filter(q=>set.filter(q.test).length<q.min).map(q=>q.name);

exec
/bin/zsh -lc 'cat src/lib/dq/reconcile/us-sample.ts; cat src/lib/dq/raw-store.ts; cat src/lib/facts/providers/edgar-companyfacts.ts | head -100; cat package.json; find .claude .cursor -maxdepth 2 -type f; ls /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/*AGENTS* /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/*AGENTS* 2>/dev/null' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
// src/lib/dq/reconcile/us-sample.ts
// US iXBRL sample manifest (spec §5.3; schema 'us-ixbrl-sample/1'). The manifest freezes members and expected
// keys of us.companyfacts_vs_ixbrl. Expected keys are the UNION of two independent sources: (a) plan 2's
// companyfacts adapter on the accession's raw snapshot (candidates, ambiguous and odd-duration entries of that
// accession), (b) the iXBRL parser on the primary document (filer entity only, tag in FACT_CONCEPTS, unit kind
// and period nature matching the concept, period end >= sinceYear-01-01, highest-priority tag per key). A key
// from one source only is still expected — at run time it becomes left_missing or right_missing and exposes
// the adapter's or parser's gap instead of shrinking the denominator. Each side needs >= 4 keys. pickSample is
// the §5.3 selection: required (plan-2 gold) tickers, the rest at equal steps in ticker order up to n, then
// quota swaps (>= 3 NYSE, >= 3 Nasdaq, >= 2 fiscal year end not 12-31, >= 2 not large accelerated); a quota
// that cannot be met is reported, never faked.
import {FACT_CONCEPTS,conceptById} from '../../facts/concepts';
import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
import type {ConceptDef,FactCandidate,ParseResult,RawSnapshot} from '../../facts/types';
import {unitKindOf} from '../../facts/units';
import {parseInlineXbrl} from './ixbrl';
import type {IxbrlDocument} from './ixbrl';
import {sha256Hex} from './pair-support';

export const US_SAMPLE_SCHEMA='us-ixbrl-sample/1';
export const US_SAMPLE_PATH='src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json';
export const MIN_KEYS_PER_SIDE=4;
export type KeyOrigin='left'|'right'|'both';
export interface SampleKey{concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:KeyOrigin}
export interface RawRef{path:string;sha256:string}
/** Live samples: where the exact bytes the keys were derived from were retained (RawStore paths). */
export interface SampleProvenance{companyfacts:RawRef;submissions:RawRef;document:RawRef}
export interface SampleFiling{provenance?:SampleProvenance;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
export interface SampleIssuer{cik:string;ticker:string;regime:'10-K'|'20-F';filings:SampleFiling[]}
export interface UsSample{schema:typeof US_SAMPLE_SCHEMA;generated_at:string;selection:string;issuers:SampleIssuer[]}
type KeyCore=Omit<SampleKey,'origin'>;

export const usNaturalKey=(cik:string,accn:string,k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${cik}:${accn}:${k.concept}:${k.period_start??''}:${k.period_end}:${k.unit}`;
const kk=(k:Pick<SampleKey,'concept'|'period_start'|'period_end'|'unit'>)=>`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`;
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
const TAG_CONCEPT=(()=>{const m=new Map<string,ConceptDef>();for(const c of FACT_CONCEPTS)for(const t of tagsOf(c))if(!m.has(t))m.set(t,c);return m;})();

/** The context entity is the SEC CIK of the filer (identifier compared without leading zeros). */
export const entityIs=(entity:string,cik:string):boolean=>entity.startsWith('http://www.sec.gov/CIK#')&&entity.slice(entity.indexOf('#')+1).replace(/^0+/,'')===cik.replace(/^0+/,'');

export function companyfactsKeys(parse:ParseResult,accn:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 const add=(c:FactCandidate)=>{if(c.filingRef!==accn)return;const k={concept:c.concept,period_start:c.periodStart,period_end:c.periodEnd,unit:c.unit,source_concept:c.sourceConcept};if(!out.has(kk(k)))out.set(kk(k),k);};
 parse.candidates.forEach(add);parse.ambiguous.forEach(a=>a.candidates.forEach(add));parse.oddDuration.forEach(add);
 return out;
}
export function ixbrlKeys(doc:IxbrlDocument,cik:string,sinceDate:string):Map<string,KeyCore>{
 const out=new Map<string,KeyCore>();
 for(const f of doc.facts){
  if(!entityIs(f.entity,cik))continue;
  const c=TAG_CONCEPT.get(f.name);
  if(!c||unitKindOf(f.unit)!==c.unitKind||(c.nature==='duration')!==(f.periodStart!==null)||f.periodEnd<sinceDate)continue;
  const k={concept:c.id,period_start:f.periodStart,period_end:f.periodEnd,unit:f.unit,source_concept:f.name};
  const prev=out.get(kk(k));
  if(!prev||tagsOf(c).indexOf(f.name)<tagsOf(c).indexOf(prev.source_concept))out.set(kk(k),k);
 }
 return out;
}

export interface BuildFilingInput{cik:string;accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;companyfacts:RawSnapshot;doc:Uint8Array;doc_sha256?:string;sinceYear:number}
export function buildSampleFiling(i:BuildFilingInput):SampleFiling{
 const left=companyfactsKeys(parseCompanyFacts(i.companyfacts,{sinceYear:i.sinceYear}),i.accn);
 const right=ixbrlKeys(parseInlineXbrl(new TextDecoder('utf-8').decode(i.doc)),i.cik,`${i.sinceYear}-01-01`);
 const keys:SampleKey[]=[];
 for(const [k,v] of left)keys.push({...v,origin:right.has(k)?'both':'left'});
 for(const [k,v] of right)if(!left.has(k))keys.push({...v,origin:'right'});
 keys.sort((a,b)=>cmp(kk(a),kk(b)));
 const nLeft=keys.filter(k=>k.origin!=='right').length,nRight=keys.filter(k=>k.origin!=='left').length;
 if(nLeft<MIN_KEYS_PER_SIDE||nRight<MIN_KEYS_PER_SIDE)throw new Error(`sample_side_too_small:${i.accn}:left=${nLeft}:right=${nRight}`);
 return {accn:i.accn,form:i.form,period_end:i.period_end,primary_document:i.primary_document,doc_url:i.doc_url,is_inline_xbrl:i.is_inline_xbrl,submissions_category:i.submissions_category,raw_sha256:i.companyfacts.sha256,doc_sha256:i.doc_sha256??sha256Hex(i.doc),expected_keys:keys};
}

const DATE=/^\d{4}-\d{2}-\d{2}$/,SHA=/^[0-9a-f]{64}$/,ACCN=/^\d{10}-\d{2}-\d{6}$/;
export function validateUsSample(json:unknown):{ok:true;sample:UsSample}|{ok:false;errors:string[]}{
 const errors:string[]=[];const e=(m:string)=>{errors.push(m);};
 const s=json as Partial<UsSample>|null;
 if(!s||typeof s!=='object')return {ok:false,errors:['not_an_object']};
 if(s.schema!==US_SAMPLE_SCHEMA)e('schema');
 if(typeof s.generated_at!=='string'||Number.isNaN(Date.parse(s.generated_at)))e('generated_at');
 if(typeof s.selection!=='string'||s.selection==='')e('selection');
 if(!Array.isArray(s.issuers)||s.issuers.length===0)return {ok:false,errors:[...errors,'issuers']};
 const nks=new Set<string>();
 s.issuers.forEach((iss,ii)=>{
  const at=`issuers[${ii}]`;
  if(typeof iss?.cik!=='string'||!/^[1-9]\d{0,9}$/.test(iss.cik))e(`${at}.cik`);
  if(typeof iss?.ticker!=='string'||iss.ticker==='')e(`${at}.ticker`);
  if(iss?.regime!=='10-K'&&iss?.regime!=='20-F')e(`${at}.regime`);
  if(!Array.isArray(iss?.filings)||iss.filings.length===0){e(`${at}.filings`);return;}
  iss.filings.forEach((f,fi)=>{
   const fa=`${at}.filings[${fi}]`;
   if(typeof f?.accn!=='string'||!ACCN.test(f.accn))e(`${fa}.accn`);
   if(typeof f?.form!=='string'||f.form==='')e(`${fa}.form`);
   if(f?.period_end!==null&&!(typeof f?.period_end==='string'&&DATE.test(f.period_end)))e(`${fa}.period_end`);
   if(typeof f?.primary_document!=='string'||f.primary_document==='')e(`${fa}.primary_document`);
   if(typeof f?.doc_url!=='string'||!f.doc_url.startsWith(`https://www.sec.gov/Archives/edgar/data/${iss.cik}/`)||/[?#@]/.test(f.doc_url))e(`${fa}.doc_url`);
   if(f?.is_inline_xbrl!==null&&typeof f?.is_inline_xbrl!=='boolean')e(`${fa}.is_inline_xbrl`);
   if(f?.submissions_category!==null&&typeof f?.submissions_category!=='string')e(`${fa}.submissions_category`);
   if(typeof f?.raw_sha256!=='string'||!SHA.test(f.raw_sha256))e(`${fa}.raw_sha256`);
   if(typeof f?.doc_sha256!=='string'||!SHA.test(f.doc_sha256))e(`${fa}.doc_sha256`);
   if(f?.provenance!==undefined){
    const pv=f.provenance as Partial<SampleProvenance>|null;
    const ref=(r:unknown,kind:string,sha:unknown)=>{const x=r as Partial<RawRef>|null;return !!x&&typeof x.path==='string'&&typeof x.sha256==='string'&&SHA.test(x.sha256)&&x.path.startsWith(`${kind}/${x.sha256}.`)&&x.sha256===sha;};
    if(!pv||typeof pv!=='object')e(`${fa}.provenance`);
    else{
     if(!ref(pv.companyfacts,'sec-companyfacts',f.raw_sha256))e(`${fa}.provenance.companyfacts`);
     if(!ref(pv.document,'sec-document',f.doc_sha256))e(`${fa}.provenance.document`);
     if(!ref(pv.submissions,'sec-submissions',(pv.submissions as Partial<RawRef>|undefined)?.sha256))e(`${fa}.provenance.submissions`);
    }
   }
   if(!Array.isArray(f?.expected_keys)){e(`${fa}.expected_keys`);return;}
   let nl=0,nr=0;
   f.expected_keys.forEach((k,ki)=>{
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
 return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...unmetQuotas(picked)]};
}
/** Names of the quotas a set of issuers does not meet (used for the pick and again on the final manifest). */
export const unmetQuotas=(set:readonly SampleCandidate[]):string[]=>QUOTAS.filter(q=>set.filter(q.test).length<q.min).map(q=>q.name);
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
// src/lib/facts/providers/edgar-companyfacts.ts
// EDGAR companyfacts adapter (spec §6.2; §3 selection rule; §4.7 raw_hash). fetchCompanyFacts: one paced
// GET (≥120 ms between SEC requests per process), timeout min(60 s, remaining − 20 s), 429/503 backoff
// 1→2→4→8 s stopped by the budget, 404 → no_companyfacts, >50 MB → snapshot_too_large. parseCompanyFacts:
// numbers decoded by field schema (cik/fy control, val decimal), per (accn,start,end,unit) the first tag
// in catalogue order with an entry wins and lower tags only fill missing periods, same-tag disagreement
// → ambiguous_value (frame only there), filings.period_end = max end of the accn's duration entries,
// fy/fp only on filings.
// Deviations from the first plan text (Task 10 review follow-up): (1) tag selection and ambiguity run over all
// entries before availability filtering; an undated higher-priority row claims its slot and parks as
// missing_available_date (its lower tags never substitute). (2) raw_hash locator is ROW level, not group level
// (spec §4.7 says group): facts.<tax>.<tag>.units.<rawUnit>[<array index>](accn=…,start=…,end=…); the string is
// also exposed as `locator` on candidates/ambiguous/odd entries and in missingAvailableDate payloads.
// (3) odd durations: disagreement → ambiguous, otherwise every entry is parked. (4) SEC pacing reserves request
// slots synchronously (concurrency-safe). (5) The body download sits inside the retry boundary. (6) Filings
// of other forms (8-K, DEF 14A, …) become formType 'other' filings and are kept as disclosures, by design.
import type {Budget,ConceptDef,Duration,FactCandidate,FilingCandidate,FormType,ParseResult,RawSnapshot} from '../types';
import {FACT_CONCEPTS} from '../concepts';
import {EDGAR_NUMBER_SCHEMA,canonicalDecimal,decodeWithSchema,scanJsonNumbers} from '../json-numbers';
import type {NumberSchema} from '../json-numbers';
import {normalizeUnit,unitKindOf} from '../units';
import {classifyDuration,daysBetween as daysBetweenOrNull,isDate} from '../classify';
import {DEFAULT_USER_AGENT} from '../../research/ingest/collectors/shared';
import {nearestDuration,PacerError,ProviderError,rawHashOf,SEC_MIN_INTERVAL_MS,secPacer,sleep,snapshotOf} from './shared';

export const companyFactsUrl=(cik10:string)=>`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10}.json`;
export const MAX_SNAPSHOT_BYTES=50*1024*1024;
export {SEC_MIN_INTERVAL_MS};
/** Same schema as json-numbers.ts: cik/fy control integers, val decimal text. */
export const COMPANYFACTS_SCHEMA:NumberSchema=EDGAR_NUMBER_SCHEMA;
const BACKOFF_MS=[1000,2000,4000,8000];
const RESERVE_MS=20_000;
const pacer=secPacer;   // process-wide (shared with SEC submissions): one pace across every SEC caller
/** Test hook: forget the pacing state (tests use fake clocks). */
export const resetSecPacing=()=>pacer.reset();

export interface FetchOptions{fetch?:typeof fetch;userAgent?:string;sleep?:typeof sleep;now?:()=>number}

export async function fetchCompanyFacts(cik10:string,budget:Budget,opts:FetchOptions={}):Promise<RawSnapshot>{
 if(!/^\d{10}$/.test(cik10))throw new ProviderError('parse_error',`bad cik ${cik10}`);
 const doFetch=opts.fetch??fetch,wait=opts.sleep??sleep,now=opts.now??Date.now;
 const ua=opts.userAgent??process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
 const url=companyFactsUrl(cik10);
 for(let attempt=0;;attempt++){
  try{await pacer.admit({budget,reserveMs:RESERVE_MS,now,sleep:wait});}catch(e){throw new ProviderError('sec_unavailable',e instanceof PacerError?e.code:'budget_aborted');}
  const timeoutMs=Math.min(60_000,budget.remainingMs()-RESERVE_MS);
  if(timeoutMs<=0)throw new ProviderError('sec_unavailable','budget_exhausted');
  let detail:string;
  try{
   const res=await doFetch(url,{headers:{'User-Agent':ua,'Accept-Encoding':'gzip, deflate',Accept:'application/json'},signal:AbortSignal.any([budget.signal,AbortSignal.timeout(timeoutMs)])});
   if(res.status===404)throw new ProviderError('no_companyfacts',`404 ${url}`);
   if(res.status===429||res.status===503)detail=`http_${res.status}_retries_exhausted`;
   else{
    if(!res.ok)throw new ProviderError('sec_unavailable',`http_${res.status}`);
    const declared=Number(res.headers.get('content-length')??'0');
    if(declared>MAX_SNAPSHOT_BYTES)throw new ProviderError('snapshot_too_large',`content-length ${declared}`);
    // the body download is inside the retry boundary: a disconnect or per-request timeout mid-body retries like a network error
    return snapshotOf(await readBounded(res,MAX_SNAPSHOT_BYTES),{source:'edgar',url,http_status:res.status});
   }
  }catch(e){
   if(e instanceof ProviderError)throw e;
   if(budget.signal.aborted)throw new ProviderError('sec_unavailable','budget_aborted');
   // includes the per-request timeout (an AbortError/TimeoutError here is not the global deadline)
   detail=`network: ${(e as Error).message}`;
  }
  if(attempt>=BACKOFF_MS.length)throw new ProviderError('sec_unavailable',detail);
  await backoff(attempt,budget,wait);
 }
}
async function backoff(attempt:number,budget:Budget,wait:typeof sleep){
 const ms=BACKOFF_MS[attempt];
 if(budget.remainingMs()-ms<=RESERVE_MS)throw new ProviderError('sec_unavailable','budget_exhausted_during_backoff');
 await wait(ms,budget.signal);
}
async function readBounded(res:Response,max:number):Promise<Uint8Array>{
 if(!res.body){const b=new Uint8Array(await res.arrayBuffer());if(b.byteLength>max)throw new ProviderError('snapshot_too_large',String(b.byteLength));return b;}
 const reader=res.body.getReader();const chunks:Uint8Array[]=[];let total=0;
 for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>max){await reader.cancel();throw new ProviderError('snapshot_too_large',`>${max}`);}chunks.push(value);}
 const out=new Uint8Array(total);let o=0;for(const c of chunks){out.set(c,o);o+=c.byteLength;}
 return out;
}

export interface CompanyFactsEntry{start?:string;end:string;val:string;accn:string;fy:number|null;fp:string|null;form:string;filed:string;frame?:string}
export interface CompanyFactsDoc{cik:number;entityName?:string;facts:Record<string,Record<string,{units:Record<string,CompanyFactsEntry[]>}>>}
export function decodeCompanyFacts(bytes:Uint8Array):CompanyFactsDoc{
 let d:Partial<CompanyFactsDoc>;
 try{d=decodeWithSchema(scanJsonNumbers(bytes),COMPANYFACTS_SCHEMA) as Partial<CompanyFactsDoc>;}catch(e){throw new ProviderError('parse_error',`json: ${(e as Error).message}`);}
 if(!d||typeof d!=='object'||typeof d.cik!=='number'||!d.facts||typeof d.facts!=='object')throw new ProviderError('parse_error','companyfacts shape: cik/facts');
 return d as CompanyFactsDoc;
}
const FORM_TYPES:readonly string[]=['10-K','10-Q','20-F','40-F','10-K/A','10-Q/A','20-F/A'];
export const mapForm=(form:unknown):FormType=>typeof form==='string'&&FORM_TYPES.includes(form)?form as FormType:'other';
export const mapFp=(fp:unknown):FilingCandidate['fiscalPeriod']=>fp==='FY'||fp==='Q1'||fp==='Q2'||fp==='Q3'?fp:null;
const qualify=(tag:string,tax:string)=>tag.includes(':')?tag:`${tax}:${tag}`;
export const tagsOf=(c:ConceptDef)=>[...c.usGaap.map(t=>qualify(t,'us-gaap')),...c.ifrs.map(t=>qualify(t,'ifrs-full'))];
const daysBetween=(a:string,b:string)=>daysBetweenOrNull(a,b)??0;

const validDecimal=(v:string)=>{try{canonicalDecimal(v);return true;}catch{return false;}};

export interface ParseOptions{concepts?:readonly ConceptDef[];sinceYear?:number;today?:Date}   // readonly: FACT_CONCEPTS is readonly (round-1 #4)
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
.claude/agents/john-cameron.md
.claude/scratch/insp3.ts
.claude/scratch/codex-prompt-13a.txt
.claude/scratch/codex-prompt-12.txt
.claude/scratch/codex-prompt-10.txt
.claude/scratch/codex-prompt-13b.txt
.claude/scratch/codex-prompt-13c.txt
.claude/scratch/carry-forward.md
.claude/scratch/codex-prompt-11.txt
.claude/scratch/sync-append.txt
.claude/scratch/codex-prompt-1b.txt
.claude/scratch/REVIEW-SPEC.md
.claude/scratch/insp2.ts
.claude/scratch/codex-prompt-1a.txt
.claude/scratch/codex-prompt-6b.txt
.claude/scratch/testdb-after-8c.log
.claude/scratch/codex-prompt-15b.txt
.claude/scratch/REVIEW-QUALITY.md
.claude/scratch/codex-prompt-6a.txt
.claude/scratch/codex-prompt-15a.txt
.claude/scratch/codex-task.sh
.claude/scratch/task-ranges.txt
.claude/scratch/codex-prompt-14a.txt
.claude/scratch/codex-prompt-7a.txt
.claude/scratch/codex-prompt-14c.txt
.claude/scratch/codex-prompt-14b.txt
.claude/scratch/codex-prompt-7b.txt
.claude/scratch/codex-prompt-4b.txt
.claude/scratch/codex-prompt-8a.txt
.claude/scratch/codex-prompt-8c.txt
.claude/scratch/codex-prompt-4a.txt
.claude/scratch/codex-prompt-8b.txt
.claude/scratch/extra-cases.ts
.claude/scratch/codex-prompt-9b.txt
.claude/scratch/codex-prompt-5a.txt
.claude/scratch/extra2.ts
.claude/scratch/codex-prompt-9a.txt
.claude/scratch/codex-prompt-5b.txt
.claude/scratch/insp.ts
.claude/scratch/codex-2b-fix.txt
.claude/scratch/codex-prompt-2a.txt
.claude/scratch/p1.txt
.claude/scratch/codex-prompt-2b.txt
.claude/scratch/codex-prompt-3b.txt
.claude/scratch/db-one.ts
.claude/scratch/insp4.ts
.claude/scratch/codex-prompt-3a.txt
.claude/scratch/IMPLEMENTER.md
.claude/launch.json
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/*AGENTS*

exec
/bin/zsh -lc './node_modules/.bin/vitest run src/lib/dq/reconcile/us-sample-live.test.ts src/lib/dq/reconcile/us-sample-v1.test.ts --cache=false' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 323ms:
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v4.1.11 /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61

 ❯ src/lib/dq/reconcile/us-sample-live.test.ts (0 test)
 ❯ src/lib/dq/reconcile/us-sample-v1.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/dq/reconcile/us-sample-live.test.ts [ src/lib/dq/reconcile/us-sample-live.test.ts ]
 FAIL  src/lib/dq/reconcile/us-sample-v1.test.ts [ src/lib/dq/reconcile/us-sample-v1.test.ts ]
Error: EPERM: operation not permitted, mkdir '/var/folders/97/wmwg4qzx02j74c3n73nh438w0000gn/T/KZ5rOpuQ53c7y3aFIN8br/ssr'
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  06:23:15
   Duration  165ms (transform 0ms, setup 0ms, import 0ms, tests 0ms, environment 0ms)


codex
No actionable regressions were identified in the commit. The targeted tests could not execute because the read-only sandbox prevented Vitest from creating its temporary directory.
No actionable regressions were identified in the commit. The targeted tests could not execute because the read-only sandbox prevented Vitest from creating its temporary directory.

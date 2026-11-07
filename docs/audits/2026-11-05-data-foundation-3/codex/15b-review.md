OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b138-68fd-7b12-9c0e-eb1257111610
--------
user
commit e91bd7a
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat e91bd7a; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1488ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-b7yBA94J' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-m0DxHeBD' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-hHmC8bKm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-JxWllJSo' (errno=Operation not permitted)
commit e91bd7a69d80c06591f7cb63bfbcb586b24e3339
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:16:49 2026 -0800

    feat(dq): recorded AAPL/MSFT inline XBRL fixtures, US sample generator and fixture sample v1
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 .../2026-11-05-data-foundation-3/verification.md   |   13 +
 scripts/dq/select-us-sample.ts                     |  126 +++
 .../gold/us-ixbrl-sample-v1.exceptions.json        |    1 +
 src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json   | 1159 ++++++++++++++++++++
 .../dq/fixtures/ixbrl/aapl-20230930.trimmed.htm    |  135 +++
 .../ixbrl/aapl-20230930.trimmed.htm.meta.json      |   36 +
 .../dq/fixtures/ixbrl/msft-20230630.trimmed.htm    |  131 +++
 .../ixbrl/msft-20230630.trimmed.htm.meta.json      |   36 +
 src/lib/dq/reconcile/us-sample-v1.test.ts          |   60 +
 9 files changed, 1697 insertions(+)

exec
/bin/zsh -lc 'ls -a | head -30; for p in /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do if test -f "$p"; then echo $p; cat "$p"; fi; done; git show e91bd7a -- scripts/dq/select-us-sample.ts src/lib/dq/reconcile/us-sample-v1.test.ts; cat src/lib/dq/fixtures/ixbrl/*.meta.json' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6bCgaPG8' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wu28pkW9' (errno=Operation not permitted)
commit e91bd7a69d80c06591f7cb63bfbcb586b24e3339
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:16:49 2026 -0800

    feat(dq): recorded AAPL/MSFT inline XBRL fixtures, US sample generator and fixture sample v1
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/select-us-sample.ts b/scripts/dq/select-us-sample.ts
new file mode 100644
index 0000000..5d994f0
--- /dev/null
+++ b/scripts/dq/select-us-sample.ts
@@ -0,0 +1,126 @@
+// scripts/dq/select-us-sample.ts
+/**
+ * Builds the US iXBRL sample manifest (spec §5.3).
+ *
+ *   npx tsx scripts/dq/select-us-sample.ts --fixtures [--out src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.json] [--generated-at <ISO>]
+ *   node --env-file=.env.local --import tsx scripts/dq/select-us-sample.ts --live --universe <sp500 payload.json> --out <path> [--n 30]
+ *
+ * --fixtures (offline, deterministic): plan 2's companyfacts fixtures of AAPL and MSFT and the recorded trimmed
+ * primary documents of their FY2023 10-Ks (record-ixbrl-fixture.ts) → selection 'fixture/1', sinceYear 2016.
+ * doc_sha256 = the SOURCE document sha256 from the recording meta (the trimmed copy differs; the pair then marks
+ * detail.right.doc_sha_mismatch); is_inline_xbrl, submissions_category and primary_document come from the
+ * recorded submissions entry.
+ * --live (network, never in CI): candidates = universe constituents ∩ SEC company_tickers.json (ticker → CIK);
+ * required = the US tickers of plan2.json; per candidate the submissions JSON gives fiscalYearEnd, category,
+ * exchanges and recent filings; pickSample(n) applies the quotas; per picked issuer: regime = latest annual form
+ * (10-K or 20-F); filings = latest inline 10-K + latest inline 10-Q, or latest inline 20-F; companyfacts and each
+ * primary document are fetched and buildSampleFiling derives the keys → selection 'live/1'. A filing whose sides
+ * are too small is skipped with a warning; unmet quotas are printed and give exit code 1 (the file is still
+ * written for review).
+ * The manifest is validated before it is written. Exit 0 ok, 1 on failure or unmet quota, 2 on bad arguments.
+ */
+import {readFileSync,writeFileSync} from 'node:fs';
+import {fetchCompanyFacts} from '../../src/lib/facts/providers/edgar-companyfacts';
+import {budgetFor,padCik,snapshotOf} from '../../src/lib/facts/providers/shared';
+import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
+import {filerClass} from '../../src/lib/dq/reconcile/pair-us-ixbrl';
+import {US_GOLD_PATH,usGoldEntries} from '../../src/lib/dq/reconcile/pair-us-gold';
+import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,buildSampleFiling,pickSample,validateUsSample} from '../../src/lib/dq/reconcile/us-sample';
+import type {SampleCandidate,SampleFiling,SampleIssuer,UsSample} from '../../src/lib/dq/reconcile/us-sample';
+
+const USAGE='usage: select-us-sample.ts (--fixtures [--out <path>] [--generated-at <ISO>] | --live --universe <path> --out <path> [--n 30])';
+const FIXTURE_SINCE_YEAR=2016;
+const FIXTURES=[
+ {ticker:'AAPL',cik:'320193',accn:'0000320193-23-000106',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
+ {ticker:'MSFT',cik:'789019',accn:'0000950170-23-035122',companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
+] as const;
+interface RecordingMeta{source_url:string;source_sha256:string;submissions:{form:string|null;reportDate:string|null;primaryDocument:string;isInlineXBRL:boolean;category:string|null}}
+
+function fixtureSample(generatedAt:string):UsSample{
+ const issuers:SampleIssuer[]=FIXTURES.map(fx=>{
+  const meta=JSON.parse(readFileSync(`${fx.doc}.meta.json`,'utf8')) as RecordingMeta;
+  const filing=buildSampleFiling({cik:fx.cik,accn:fx.accn,form:meta.submissions.form??'10-K',period_end:meta.submissions.reportDate,primary_document:meta.submissions.primaryDocument,doc_url:meta.source_url,
+   is_inline_xbrl:meta.submissions.isInlineXBRL,submissions_category:meta.submissions.category,companyfacts:snapshotOf(new Uint8Array(readFileSync(fx.companyfacts)),{source:'edgar'}),
+   doc:new Uint8Array(readFileSync(fx.doc)),doc_sha256:meta.source_sha256,sinceYear:FIXTURE_SINCE_YEAR});
+  return {cik:fx.cik,ticker:fx.ticker,regime:'10-K',filings:[filing]};
+ });
+ return {schema:US_SAMPLE_SCHEMA,generated_at:generatedAt,selection:'fixture/1',issuers};
+}
+
+const UA=process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT;
+const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
+async function get(url:string):Promise<Uint8Array>{
+ await pause(150);
+ const res=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(60_000)});
+ if(!res.ok)throw new Error(`http_${res.status} ${url}`);
+ return new Uint8Array(await res.arrayBuffer());
+}
+const json=async<T>(url:string)=>JSON.parse(new TextDecoder().decode(await get(url))) as T;
+interface Submissions{category?:string;fiscalYearEnd?:string;exchanges?:string[];filings?:{recent?:Record<string,unknown[]>}}
+interface Recent{accn:string;form:string;filingDate:string;reportDate:string|null;primaryDocument:string;inline:boolean}
+function recentOf(s:Submissions):Recent[]{
+ const r=s.filings?.recent??{};const n=(r.accessionNumber??[]).length;const out:Recent[]=[];
+ for(let i=0;i<n;i++)out.push({accn:String(r.accessionNumber![i]),form:String(r.form?.[i]??''),filingDate:String(r.filingDate?.[i]??''),reportDate:r.reportDate?.[i]?String(r.reportDate[i]):null,primaryDocument:String(r.primaryDocument?.[i]??''),inline:r.isInlineXBRL?.[i]===1||r.isInlineXBRL?.[i]===true});
+ return out.sort((a,b)=>a.filingDate<b.filingDate?1:a.filingDate>b.filingDate?-1:0);
+}
+
+async function liveSample(universePath:string,n:number):Promise<{sample:UsSample;unmet:string[];warnings:string[]}>{
+ const universe=JSON.parse(readFileSync(universePath,'utf8')) as {constituents:{ticker:string;exchange?:string}[]};
+ const tickers=await json<Record<string,{cik_str:number;ticker:string}>>('https://www.sec.gov/files/company_tickers.json');
+ const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
+ const required=usGoldEntries(JSON.parse(readFileSync(US_GOLD_PATH,'utf8'))).entries.map(e=>e.ticker);
+ const subs=new Map<string,Submissions>();const candidates:SampleCandidate[]=[];const warnings:string[]=[];
+ for(const c of universe.constituents){
+  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
+  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
+  const s=await json<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`).catch(e=>{warnings.push(`${ticker}: ${(e as Error).message}`);return null;});
+  if(!s)continue;
+  subs.set(cik,s);
+  candidates.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
+ }
+ const {picked,unmet}=pickSample(candidates,required,n);
+ const sinceYear=new Date().getUTCFullYear()-10;
+ const issuers:SampleIssuer[]=[];
+ for(const p of picked){
+  const s=subs.get(p.cik)!;const recent=recentOf(s).filter(r=>r.inline);
+  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
+  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
+  const regime=annual.form as '10-K'|'20-F';
+  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
+  const companyfacts=await fetchCompanyFacts(padCik(p.cik),budgetFor(120_000));
+  const filings:SampleFiling[]=[];
+  for(const r of chosen){
+   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
+   try{filings.push(buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts,doc:await get(url),sinceYear}));}
+   catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);}
+  }
+  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
+ }
+ return {sample:{schema:US_SAMPLE_SCHEMA,generated_at:new Date().toISOString(),selection:'live/1',issuers},unmet,warnings};
+}
+
+async function main(){
+ const argv=process.argv.slice(2);let mode:''|'fixtures'|'live'='';let out='';let universe='';let n=30;let generatedAt=new Date().toISOString();
+ for(let i=0;i<argv.length;i++){
+  const x=argv[i],v=argv[i+1];
+  if(x==='--fixtures')mode='fixtures';
+  else if(x==='--live')mode='live';
+  else if(x==='--out'&&v){out=v;i++;}
+  else if(x==='--universe'&&v){universe=v;i++;}
+  else if(x==='--n'&&v&&/^\d{1,3}$/.test(v)){n=Number(v);i++;}
+  else if(x==='--generated-at'&&v&&!Number.isNaN(Date.parse(v))){generatedAt=v;i++;}
+  else{console.error(USAGE);process.exit(2);}
+ }
+ if(mode===''||(mode==='live'&&(!universe||!out))){console.error(USAGE);process.exit(2);}
+ let sample:UsSample;let unmet:string[]=[];let warnings:string[]=[];
+ if(mode==='fixtures'){sample=fixtureSample(generatedAt);out||=US_SAMPLE_PATH;}
+ else ({sample,unmet,warnings}=await liveSample(universe,n));
+ const v=validateUsSample(sample);
+ if(!v.ok){console.error(JSON.stringify({invalid:v.errors}));process.exit(1);}
+ writeFileSync(out,`${JSON.stringify(sample,null,1)}\n`);
+ for(const w of warnings)console.error(`warning: ${w}`);
+ console.log(JSON.stringify({out,selection:sample.selection,issuers:sample.issuers.length,filings:sample.issuers.reduce((k,i)=>k+i.filings.length,0),keys:sample.issuers.reduce((k,i)=>k+i.filings.reduce((m,f)=>m+f.expected_keys.length,0),0),unmet}));
+ process.exit(unmet.length>0?1:0);
+}
+
+main().catch(e=>{console.error(e instanceof Error?e.stack??e.message:e);process.exit(1);});
diff --git a/src/lib/dq/reconcile/us-sample-v1.test.ts b/src/lib/dq/reconcile/us-sample-v1.test.ts
new file mode 100644
index 0000000..460af51
--- /dev/null
+++ b/src/lib/dq/reconcile/us-sample-v1.test.ts
@@ -0,0 +1,60 @@
+// src/lib/dq/reconcile/us-sample-v1.test.ts
+// Offline consistency of the fixture sample v1 (no database): for every expected key of every filing, the
+// companyfacts fixture value of that accession and the recorded iXBRL document value must be equal, and every
+// key must be present on both sides — unless the key is listed with an explanation in
+// us-ixbrl-sample-v1.exceptions.json. This is the cheap pre-check of the "all passed" assertion of
+// ixbrl-pair.integration.test.ts; an exception is never added to make a test pass, only to register an
+// explained, real discrepancy (each one is also written up in the E4 audit note).
+import {readFileSync} from 'node:fs';
+import {describe,expect,it} from 'vitest';
+import {conceptById} from '../../facts/concepts';
+import {parseCompanyFacts,tagsOf} from '../../facts/providers/edgar-companyfacts';
+import {snapshotOf} from '../../facts/providers/shared';
+import {compareDecimal} from './decimal';
+import {indexIxFacts,parseInlineXbrl} from './ixbrl';
+import {US_SAMPLE_PATH,entityIs,usNaturalKey,validateUsSample} from './us-sample';
+
+const read=(p:string)=>readFileSync(p);
+const FIXTURE:Record<string,{companyfacts:string;doc:string}>={
+ '0000320193-23-000106':{companyfacts:'src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm'},
+ '0000950170-23-035122':{companyfacts:'src/lib/facts/fixtures/edgar/CIK0000789019.trimmed.json',doc:'src/lib/dq/fixtures/ixbrl/msft-20230630.trimmed.htm'},
+};
+interface Exception{natural_key:string;outcome:string;explanation:string}
+const EXCEPTIONS=JSON.parse(readFileSync('src/lib/dq/fixtures/gold/us-ixbrl-sample-v1.exceptions.json','utf8')) as Exception[];
+
+describe('us-ixbrl-sample-v1 (fixture sample, offline)',()=>{
+ const v=validateUsSample(JSON.parse(readFileSync(US_SAMPLE_PATH,'utf8')));
+ it('is a valid manifest with AAPL and MSFT FY2023 10-Ks',()=>{
+  expect(v.ok).toBe(true);
+  if(!v.ok)return;
+  expect(v.sample.selection).toBe('fixture/1');
+  expect(v.sample.issuers.map(i=>[i.ticker,i.filings.map(f=>f.accn)])).toEqual([['AAPL',['0000320193-23-000106']],['MSFT',['0000950170-23-035122']]]);
+  for(const e of EXCEPTIONS)expect(e.explanation.trim().length,`${e.natural_key}: explanation`).toBeGreaterThan(20);
+ });
+ it('every expected key has equal values on both sides, except the registered, explained exceptions',()=>{
+  if(!v.ok)throw new Error('invalid sample');
+  const found:{natural_key:string;outcome:string}[]=[];
+  for(const iss of v.sample.issuers)for(const f of iss.filings){
+   const fx=FIXTURE[f.accn];
+   const parse=parseCompanyFacts(snapshotOf(new Uint8Array(read(fx.companyfacts)),{source:'edgar'}),{sinceYear:2016});
+   const left=new Map(parse.candidates.filter(c=>c.filingRef===f.accn).map(c=>[`${c.concept}|${c.periodStart??''}|${c.periodEnd}|${c.unit}`,c]));
+   const doc=parseInlineXbrl(read(fx.doc).toString('utf8'));
+   const idx=indexIxFacts(doc.facts.filter(x=>entityIs(x.entity,iss.cik)).map(x=>({...x,entity:'filer'})));
+   for(const k of f.expected_keys){
+    const nk=usNaturalKey(iss.cik,f.accn,k);
+    const l=left.get(`${k.concept}|${k.period_start??''}|${k.period_end}|${k.unit}`);
+    if(!l){found.push({natural_key:nk,outcome:'left_missing'});continue;}
+    const def=conceptById(k.concept)!;
+    const tags=[l.sourceConcept,...tagsOf(def).filter(t=>t!==l.sourceConcept)];
+    const hit=tags.map(t=>idx.get([t,'filer',k.period_start??'',k.period_end,k.unit].join('|'))).find(h=>h!==undefined);
+    if(!hit){
+     const unsupported=doc.unsupported.some(u=>u.name!==undefined&&tags.includes(u.name)&&u.periodEnd===k.period_end&&(u.periodStart??null)===k.period_start);
+     found.push({natural_key:nk,outcome:unsupported?'unsupported':'right_missing'});continue;
+    }
+    if(hit.values.length>1){found.push({natural_key:nk,outcome:'right_ambiguous'});continue;}
+    if(compareDecimal(l.value,hit.values[0])!==0)found.push({natural_key:nk,outcome:'compared_failed'});
+   }
+  }
+  expect(found).toEqual(EXCEPTIONS.map(({natural_key,outcome})=>({natural_key,outcome})));
+ });
+});
{
 "source_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm",
 "source_sha256": "0f18e0ee9f9e7ebf89e8d4edae8fbebe33c8c9fb4ac43a9b9e5c777e02991bc6",
 "source_bytes": 1559043,
 "fetched_at": "2026-11-06T14:16:00.429Z",
 "trim_version": "ixbrl-trim/1",
 "parser_version": "ixbrl/1",
 "trimmed_sha256": "df0a11f52de48306524b2ebc7cc9ac6aad296164f1bb51be54541f8f70cfffcc",
 "facts": 115,
 "contexts": 8,
 "units": 3,
 "raw": {
  "document": {
   "path": "sec-document/0f18e0ee9f9e7ebf89e8d4edae8fbebe33c8c9fb4ac43a9b9e5c777e02991bc6.html",
   "sha256": "0f18e0ee9f9e7ebf89e8d4edae8fbebe33c8c9fb4ac43a9b9e5c777e02991bc6",
   "status": "stored"
  },
  "submissions": {
   "path": "sec-submissions/2c9cbb2f163361bf1fd0318faadb50cdfa719104d45aa39934f29d554d3a4916.json",
   "sha256": "2c9cbb2f163361bf1fd0318faadb50cdfa719104d45aa39934f29d554d3a4916",
   "status": "stored"
  }
 },
 "submissions": {
  "url": "https://data.sec.gov/submissions/CIK0000320193.json",
  "sha256": "2c9cbb2f163361bf1fd0318faadb50cdfa719104d45aa39934f29d554d3a4916",
  "accession": "0000320193-23-000106",
  "form": "10-K",
  "filingDate": "2023-11-03",
  "reportDate": "2023-09-30",
  "primaryDocument": "aapl-20230930.htm",
  "isInlineXBRL": true,
  "category": "Large accelerated filer",
  "fiscalYearEnd": "0926"
 }
}
{
 "source_url": "https://www.sec.gov/Archives/edgar/data/789019/000095017023035122/msft-20230630.htm",
 "source_sha256": "df4c8e4eab796f8c6bb3b986f841abf7d598e68feabde71f6834c431c61362b4",
 "source_bytes": 9963710,
 "fetched_at": "2026-11-06T14:16:03.170Z",
 "trim_version": "ixbrl-trim/1",
 "parser_version": "ixbrl/1",
 "trimmed_sha256": "66703f6d2da3ed835737cb8eef537d078c91fd6c68e2f6ee6990d47b4048e64e",
 "facts": 112,
 "contexts": 8,
 "units": 3,
 "raw": {
  "document": {
   "path": "sec-document/df4c8e4eab796f8c6bb3b986f841abf7d598e68feabde71f6834c431c61362b4.html",
   "sha256": "df4c8e4eab796f8c6bb3b986f841abf7d598e68feabde71f6834c431c61362b4",
   "status": "stored"
  },
  "submissions": {
   "path": "sec-submissions/1a4256a23be814a5193601a2c733d1da647c45da4d73dfe98eee58e32f8f9251.json",
   "sha256": "1a4256a23be814a5193601a2c733d1da647c45da4d73dfe98eee58e32f8f9251",
   "status": "stored"
  }
 },
 "submissions": {
  "url": "https://data.sec.gov/submissions/CIK0000789019.json",
  "sha256": "1a4256a23be814a5193601a2c733d1da647c45da4d73dfe98eee58e32f8f9251",
  "accession": "0000950170-23-035122",
  "form": "10-K",
  "filingDate": "2023-07-27",
  "reportDate": "2023-06-30",
  "primaryDocument": "msft-20230630.htm",
  "isInlineXBRL": true,
  "category": "Large accelerated filer",
  "fiscalYearEnd": "0630"
 }
}

exec
/bin/zsh -lc "cat src/lib/dq/reconcile/us-sample.ts; cat src/lib/dq/reconcile/ixbrl-pair.integration.test.ts; cat src/lib/facts/providers/edgar-companyfacts.ts | head -100; find . -iname '*agents*' -o -name CLAUDE.md; git show e91bd7a -- docs/audits/2026-11-05-data-foundation-3/verification.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 72ms:
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
export interface SampleFiling{accn:string;form:string;period_end:string|null;primary_document:string;doc_url:string;is_inline_xbrl:boolean|null;submissions_category:string|null;raw_sha256:string;doc_sha256:string;expected_keys:SampleKey[]}
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
 return {picked:picked.sort((a,b)=>cmp(a.ticker,b.ticker)),unmet:[...missing,...QUOTAS.filter(q=>count(q)<q.min).map(q=>q.name)]};
}
cat: src/lib/dq/reconcile/ixbrl-pair.integration.test.ts: No such file or directory
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
./node_modules/dsh-trade-strategy-evaluator/agents
./node_modules/playwright/lib/agents
./node_modules/playwright/lib/agents/generateAgents.js
./node_modules/caniuse-lite/dist/unpacker/agents.js
./node_modules/caniuse-lite/data/agents.js
./.claude/agents
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-My2bAx3W' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-52XfFI3k' (errno=Operation not permitted)
commit e91bd7a69d80c06591f7cb63bfbcb586b24e3339
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:16:49 2026 -0800

    feat(dq): recorded AAPL/MSFT inline XBRL fixtures, US sample generator and fixture sample v1
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/docs/audits/2026-11-05-data-foundation-3/verification.md b/docs/audits/2026-11-05-data-foundation-3/verification.md
index f17977b..b7660c0 100644
--- a/docs/audits/2026-11-05-data-foundation-3/verification.md
+++ b/docs/audits/2026-11-05-data-foundation-3/verification.md
@@ -67,3 +67,16 @@
 | 00386 | `SINOPEC CORP` | Equity | `sinopec` | `chinapetroleumchemical` | 否 |
 
 结论：HKEX 名单用的是简称（`PING AN`、`CM BANK`、`SINOPEC CORP`），不是测试里假设的 "… CO LTD - H" 全称；5 家中 2 家归一后相等，3 家不等。按计划，不改测试也不扩词表（测试验证的是归一规则本身）；规则 2 的实际命中率会低（只有 HKEX 简称恰好等于发行人名称的公司），不匹配时"不产生声明"，是精度优先的预期结果。规则 1（同 LEI + HKEX ISIN 硬标识符）才是主要的自动挂接路径。
+
+## F3-5 iXBRL 夹具（Task 15b，2026-11-06）
+
+| accn | 主文档 URL | source_sha256 | trimmed_sha256 | 事实数 | submissions category | isInlineXBRL |
+|---|---|---|---|---|---|---|
+| 0000320193-23-000106 | https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm | 0f18e0ee9f9e7ebf89e8d4edae8fbebe33c8c9fb4ac43a9b9e5c777e02991bc6 | df0a11f52de48306524b2ebc7cc9ac6aad296164f1bb51be54541f8f70cfffcc | 115 | Large accelerated filer | true |
+| 0000950170-23-035122 | https://www.sec.gov/Archives/edgar/data/789019/000095017023035122/msft-20230630.htm | df4c8e4eab796f8c6bb3b986f841abf7d598e68feabde71f6834c431c61362b4 | 66703f6d2da3ed835737cb8eef537d078c91fd6c68e2f6ee6990d47b4048e64e | 112 | Large accelerated filer | true |
+
+- 裁剪规则 `ixbrl-trim/1`，解析器 `ixbrl/1`；重录命令见 `scripts/dq/record-ixbrl-fixture.ts` 头注释。原始文档与 submissions 经 `--raw-dir` 留在本机 `.claude/scratch/raw-15b/`（未提交）。
+- 样本 `us-ixbrl-sample-v1.json`（`fixture/1`，sinceYear 2016）：键数 AAPL 72 / MSFT 67（全部 origin=both）；离线一致性例外 0。
+- 夹具使用真实 CIK 与 accession（计划未要求改键）。
+- 未纳入：30 家生产样本 v2（需网络与 owner 决策 E；`--live`），E4 以 v2 计量。
+- `ixt-sec:*` 格式出现次数：AAPL 1 / MSFT 0（规格 §14 开放问题 6 的首个数据点）。

exec
/bin/zsh -lc "rg 'constituents|exchange:' src/lib/universe -n | head -35; rg -n '5.3|30 家|NASDAQ|纳斯达克' docs/spec* docs/plans/*foundation* 2>/dev/null | head -35; ls data; rg -n 'interface.*Constituent|exchange.*NASDAQ|exchange.*NYSE' src/lib | head -35; head -20 src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm; cat package.json | grep -A20 scripts; ls -a /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees | head" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
rg: src/lib/universe: IO error for operation on src/lib/universe: No such file or directory (os error 2)
zsh:1: no matches found: docs/spec*
securities
src/lib/entities/provenance.test.ts:25:  expect(code({exchange:'NYSE'})).toBe('unknown_key@exchange');
src/lib/entities/load-sec.test.ts:42:   {cik:'1067983',name:'Berkshire',ticker:'BRK-B',exchange:'NYSE'},
src/lib/entities/load-sec.test.ts:55:   {cik:'1067983',ticker:'BRK.B',share_class:'unknown',is_primary:true,valid_from:AS_OF,source:'sec_company_tickers_exchange',provenance:{valid_from:{...prov,row:{exchange:'NYSE'}}}},
src/lib/entities/load-sec.test.ts:61:   {cik:'1067983',name:'Berkshire',ticker:'BRK.A',exchange:'NYSE'},
src/lib/entities/load-sec.test.ts:62:   {cik:'1067983',name:'Berkshire',ticker:'brk.a',exchange:'NYSE'},
src/lib/entities/load-sec.test.ts:69:  const rows=Array.from({length:100_001},(_,i)=>({cik:String(i+1),name:'X',ticker:'X',exchange:'NYSE'}));
src/lib/securities/sync/validate.test.ts:29:      exchange: scope === 'hk_main' ? 'HKEX' as const : scope.startsWith('a_') ? 'SZSE' as const : 'NASDAQ' as const,
src/lib/securities/search.test.ts:21:      data: [{ t: 'OLD', n: 'Old Co', py: '', m: 'US', asset_type: 'stock', exchange: 'NYSE', list_status: 'delisted', match_kind: 'exact_ticker', verification_status: 'inactive', selectable: false }] satisfies SecuritySearchRow[],
src/lib/securities/discovery.test.ts:41:      exchange: 'NASDAQ',
src/lib/securities/sources/us-universes.test.ts:23:    exchange: 'NASDAQ',
src/lib/securities/sources/us-universes.test.ts:93:      { ticker: 'AAPL', rawSymbol: 'AAPL', name: 'Apple Inc. Common Stock', exchange: 'NASDAQ' as const },
src/lib/securities/sources/us-universes.test.ts:94:      { ticker: 'BABA', rawSymbol: 'BABA', name: 'Alibaba Group American Depositary Shares', exchange: 'NYSE' as const },
src/lib/securities/sources/us-universes.test.ts:95:      { ticker: 'BADW', rawSymbol: 'BADW', name: 'Bad Corp Warrants', exchange: 'NASDAQ' as const },
src/lib/securities/sources/us-universes.test.ts:96:      { ticker: 'BADP', rawSymbol: 'BADP', name: 'Bad Corp Preferred Stock', exchange: 'NYSE' as const },
src/lib/securities/sources/us-universes.test.ts:99:      { ticker: 'AAPL', name: 'Apple Inc. Common Stock', exchange: 'NASDAQ' as const, market_cap_usd: 3e12, country_code: 'US', sector: 'Technology', industry: 'Computer Manufacturing' },
src/lib/securities/sources/us-universes.test.ts:100:      { ticker: 'BABA', name: 'Alibaba Group American Depositary Shares', exchange: 'NYSE' as const, market_cap_usd: 2e11, country_code: 'CN', sector: 'Consumer', industry: 'Retail' },
src/lib/securities/sources/us-universes.test.ts:101:      { ticker: 'BADW', name: 'Bad Corp Warrants', exchange: 'NASDAQ' as const, market_cap_usd: 1e8, country_code: 'US', sector: null, industry: null },
src/lib/securities/sources/us-universes.test.ts:102:      { ticker: 'BADP', name: 'Bad Corp Preferred Stock', exchange: 'NYSE' as const, market_cap_usd: null, country_code: 'US', sector: null, industry: null },
src/lib/securities/sources/us-universes.test.ts:112:      { security: security('BABA', { exchange: 'NYSE', country_code: 'CN', instrument_form: 'adr' }), market_cap_usd: 2e11 },
src/lib/securities/sources/sp500.ts:5:interface Sp500Constituent {
src/lib/securities/sources/sp500.ts:8:  exchange?: 'NASDAQ' | 'NYSE' | 'AMEX';
src/lib/securities/sources/sp500.ts:90:    const exchange = constituent.exchange ?? 'NYSE';
src/lib/securities/sources/us-universes.ts:92:      && row.security.exchange === 'NASDAQ'
src/lib/securities/sources/nasdaq-screener.ts:8:  exchange: Extract<SecurityExchange, 'NASDAQ' | 'NYSE' | 'AMEX'>;
src/lib/securities/sources/nasdaq-directory.ts:9:  exchange: Extract<SecurityExchange, 'NASDAQ' | 'NYSE' | 'AMEX'>;
src/lib/securities/sources/nasdaq-directory.ts:51:    const exchange = kind === 'nasdaq' ? 'NASDAQ' : otherExchange(values[exchangeIndex]);
src/lib/dq/reconcile/us-sample.ts:120: {name:'nyse',min:3,test:c=>c.exchange==='NYSE'},
src/lib/dq/reconcile/us-sample.test.ts:66: const cand=(i:number,o:Partial<SampleCandidate>={}):SampleCandidate=>({ticker:`T${String(i).padStart(3,'0')}`,cik:String(1000+i),exchange:'NYSE',fiscalYearEnd:'1231',acceleration:'large_accelerated',...o});
src/lib/dq/reconcile/us-sample.test.ts:72:  expect(picked.filter(p=>p.exchange==='NYSE').length).toBeGreaterThanOrEqual(3);
src/lib/research/s4/read.ts:38:    securities:(await db.query("select ticker,name,exchange,currency,metadata->'synthetic' as synthetic from public.stocks_universe where exchange in ('XNYS','NYSE') and currency='USD' and is_active=true order by ticker limit 1000")).rows,
src/lib/research/s4/integration.test.ts:92:  await admin.query("insert into stocks_universe(ticker,name,market,exchange,currency) values('S4REALTEST','Not synthetic marker','US','NYSE','USD') on conflict do nothing");
src/lib/research/entity-keys/parsers.test.ts:37:  const json=JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[320193,'Apple Inc.','AAPL','Nasdaq'],['789019','MICROSOFT CORP','MSFT','Nasdaq'],['abc','Bad','BAD','NYSE'],[1,'No ticker','','NYSE']]});
src/lib/research/entity-keys/parsers.test.ts:49:  const json=JSON.stringify({fields:['cik','name','ticker','exchange'],data:[[0,'Zero','Z','NYSE'],['00000320193','Too long','L','NYSE'],[12345678901,'Eleven','E','NYSE'],['0000320193','Apple Inc.','AAPL','Nasdaq'],[-1,'Neg','N','NYSE']]});
<?xml version="1.0" encoding="utf-8"?>
<!-- ixbrl-trim/1: 115 facts -->
<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:aapl="http://www.apple.com/20230930" xmlns="http://www.w3.org/1999/xhtml" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:srt="http://fasb.org/srt/2023" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:country="http://xbrl.sec.gov/country/2023" xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:ecd="http://xbrl.sec.gov/ecd/2023" xml:lang="en-US">
<head><title>trimmed</title></head>
<body>
<div style="display:none"><ix:header><ix:resources>
<xbrli:context id="c-1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2022-09-25</xbrli:startDate><xbrli:endDate>2023-09-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-13"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-10-20</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-20"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2021-09-26</xbrli:startDate><xbrli:endDate>2022-09-24</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-21"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2020-09-27</xbrli:startDate><xbrli:endDate>2021-09-25</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-22"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-23"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2022-09-24</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-24"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2021-09-25</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-25"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2020-09-26</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
</ix:resources></ix:header></div>
<p><ix:nonNumeric contextRef="c-1" name="dei:DocumentFiscalYearFocus" id="f-60">2023</ix:nonNumeric></p>
<p><ix:nonNumeric contextRef="c-1" name="dei:DocumentPeriodEndDate" format="ixt:date-monthname-day-year-en" id="f-4"><ix:nonNumeric contextRef="c-1" name="dei:CurrentFiscalYearEndDate" format="ixt:date-monthname-day-en" id="f-3">September&#160;30</ix:nonNumeric>, 2023</ix:nonNumeric></p>
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude:
.
..
agents
launch.json
worktrees

/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees:
.
..

exec
/bin/zsh -lc "cat src/lib/dq/fixtures/gold/plan2.json | head -65; rg -n 'US_SAMPLE_PATH|sinceYear' src/lib/dq/reconcile/pair-us-ixbrl.ts; rg -n '5.3|不少于|30 家|10-Q' docs/*/*data-foundation* | head -35; nl -ba scripts/dq/select-us-sample.ts | sed -n '68,101p'; cat src/lib/securities/sources/sp500.ts | head -40; find /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude -maxdepth 2 -name 'AGENTS*'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
cat: src/lib/dq/fixtures/gold/plan2.json: No such file or directory
3:// manifest (US_SAMPLE_PATH). Per accession, in this order:
40:import {US_SAMPLE_PATH,US_SAMPLE_SCHEMA,entityIs,usNaturalKey,validateUsSample} from './us-sample';
108: const {json,sha256}=await readRepoJson(ctx,US_SAMPLE_PATH,'invalid_sample_file');
134:  inputs:{repoFile:US_SAMPLE_PATH,parserVersion:IXBRL_PARSER_VERSION,goldSchema:US_SAMPLE_SCHEMA},
docs/runbooks/data-foundation.md:228:| 同一 `end_date` 下 1 与 5 同日并存是否出现 | 未核对 | 出现时按 §5.3：不同 filing → `same_day_conflict`，同 filing → `ambiguous_value` |
docs/runbooks/data-foundation.md:242:环境：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`；`EDGAR_USER_AGENT`（SEC 要求带联系方式；缺省 `DEFAULT_USER_AGENT`，生产务必设置真实值）；`TUSHARE_TOKEN`（仅 CN）；`CRON_SECRET`（cron；缺失 → 503 `cron_unavailable`）；`FACTS_CN_ENABLED=1`（CN `--apply` 与 CN cron 的开关，缺省关）；`VERCEL_GIT_COMMIT_SHA`（Vercel 自动注入；cron 路由只认它，缺失 → 503 `code_version_unavailable`；脚本回退到 `git rev-parse HEAD`，脏树加 `-dirty`；取不到则拒绝 `--apply`）。
docs/runbooks/data-foundation.md:320:两个清单查询都必须返回 0 行（任何遗留的旧签名重载会出现在第一个清单里：按它列出的签名补 `drop function`）。**演练**（合并前一次，在 `test:db` 的临时库上）：应用全部迁移 → 执行本节脚本 → 两个清单为空 → 重新应用 `20261106090000_financial_facts.sql` → `facts.integration.test.ts` 通过。`ingest_batches` 中 `producer='facts-sync'` 的回执与 `dq_freshness` 的 `facts.*` 行保留。同时从 `vercel.json` 移除 `facts-sync` 条目并重新部署，否则 cron 会打到已无表的函数上（503/500 进入 Vercel 日志）。
docs/audits/2026-11-04-data-foundation-2/09-codex-spec-audit-round5.md:7:| R4-3 | PARTIAL | §5.3 preserves contested-group membership, but abandoned dispositions leave a recovery hole; R5-1 below. |
docs/audits/2026-11-04-data-foundation-2/09-codex-spec-audit-round5.md:8:| R4-4 | PARTIAL | §§4.5/7.3 enforce publication, generation and durable selection eligibility; resolution before publication still lacks a complete lifecycle, R5-3. |
docs/audits/2026-11-04-data-foundation-2/09-codex-spec-audit-round5.md:17:**§§4.5, 5.3, 6.1 steps 7–8, 7.1.** Publish A=10; stage conflicting B=20, create the open conflict item, and record A’s pending disposition; abandon B’s run. A correctly remains `ok`, but the conflict item remains open. On retry, B receives a new fact ID and enters §5.3 branch 1: quarantine B and merge its ID. That branch does not recreate A’s disposition. Publication therefore leaves A publicly selected despite a published conflicting B and an unresolved group, contradicting the promised fallback to an earlier date. **Fix:** when publishing a contested group, account for every still-`ok` member, including dispositions originating in abandoned runs; test this exact retry sequence.
docs/audits/2026-11-04-data-foundation-2/09-codex-spec-audit-round5.md:22:**R5-3 · P2 — Resolving a conflict before its pending dispositions execute can strand the chosen fact.**  
docs/audits/2026-11-05-data-foundation-3-plan/01-codex-plan-audit-round1.md:3:| P1 | P1 | Task 11, adoption implementation | **Adoption can bypass statement checks.** `plan:12513` reads without `history:true`, then `plan:12500` filters to the candidate’s filing. A later disclosure can therefore hide that filing’s balancing rows, allowing an inconsistent candidate to pass. Landed `src/lib/facts/read.ts:56` keeps only current disclosures by default; `src/lib/facts/rules.ts:82` requires same-filing, same-generation inputs. | Read with `history:true`, reject truncated reads, and evaluate against all eligible rows of the candidate’s filing and generation. Preserve the revision check. Add a regression where a later filing supersedes the original balancing facts. |
docs/audits/2026-11-05-data-foundation-3-plan/01-codex-plan-audit-round1.md:6:| P4 | P1 | Tasks 8c, 11 and 14b, hook persistence | **Hook completion can overwrite a newer reconciliation verdict.** `plan:15333–15334` and `plan:12435–12439` replace `detail` after a separate read. Concurrent hook recovery and `apply_reconcile_result` can restore an older `latest_result`, including replacing a newer failure with an older pass. The inherited pattern at landed `src/lib/dq/facts-resolver.ts:48–51` is not safe for these newly concurrent writers; `src/lib/db/table-client.ts:103` replaces the supplied JSON value. | Add an atomic RPC that updates only `detail.hook` under the item lock; similarly patch `audit_written` without replacing detail. Add an interleaving test proving hook writes preserve the newest `latest_result` and resolution fields. |
docs/audits/2026-11-04-data-foundation-2/11-codex-spec-audit-round6.md:1:R5-1 — **RESOLVED**: §§4.5/5.3 derive dispositions from persistent open conflict membership, covering abandonment and retry; §11.2 adds that regression test.  
docs/audits/2026-11-04-data-foundation-2/11-codex-spec-audit-round6.md:3:R5-3 — **PARTIAL**: §7.3 checks only the original `payload.run_id`; §7.1 permits subsequent runs to extend `fact_ids` without updating that run reference.
docs/audits/2026-11-04-data-foundation-2/11-codex-spec-audit-round6.md:6:Sections **4.5, 5.3, 7.1, 7.3** of the [sixth draft](/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-2/docs/superpowers/specs/2026-11-04-data-foundation-2-disclosure-facts-design.md:419):
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:25:| 21 | N21 | PARTIAL | §§5.3–5.4 freeze denominators and require the CN suite, but US expectations originate only from already-`ok` facts and CN validation does not enforce the complete company/year/concept product. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:33:| 29 | N29 | PARTIAL | §1.1 adds measurement artifacts and §5.3 handles 20-F sampling; E1/E2 denominators and several work-package exit conditions remain inconsistent. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:54:| M10 | P1 | §3.2; plan 2 §§4.6, 5.3 | **The single-issuer reader is not field-identical in all supported modes.** With `includeNonOk=true`, one issuer can have differing same-day `ok`/`quarantined` or staged candidates. Plan 2 returns those rows with its normal window calculations; the lineage reader’s unrestricted “same K/date, different values” suppression changes `is_current` and `history=false` results. Removing outer envelope fields does not restore semantics. | Preserve the existing single-issuer reader behavior exactly, and apply cross-issuer conflict handling only to the appropriate published, visible lineage inputs. Test service-role planning reads as well as anonymous reads. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:59:| M15 | P1 | §§1.1 E4/E5, 5.3–5.4 | **The revised gates remain omission-sensitive.** US expectations are generated from facts already `ok`, so a broken parser or pre-existing quarantine reduces the frozen denominator. No minimum keys per filing is required. CN validation checks counts and uniqueness but not the exact four-year × six-concept product; N is recomputed from the supplied sample. Scope N may exceed 30 while the text also caps N at 30, with no selection rule or zero-N behavior. | Freeze an independently enumerated expected-key manifest; enforce every required company/year/concept key, minimum coverage, nonzero denominators, and a deterministic cap. Report unavailable inputs as failures, not excluded expectations. |
docs/audits/2026-11-04-data-foundation-3/02-codex-round2.md:60:| M16 | P2 | §§5.3–5.4, 9.3 | **US sample fact IDs are not portable between production and offline CI.** The manifest freezes database row IDs, while the integration test ingests fixtures into a fresh database. No deterministic-ID or natural-key rebinding contract exists. Regeneration after mapping changes is similarly undefined. | Store stable source/natural keys and resolve them to environment-local fact IDs, retaining explicit missing outcomes. |
docs/audits/2026-11-04-data-foundation-2-plan/02-dispositions.md:61:| 5（PARTIAL） | ACCEPT | Task 10 Step 1：`fetch` mock 的初始化式不再读取 `fetch.mock.calls`（自引用 → TS7022/TS7024），改用独立的 `attempts` 计数器决定 429/503/200；mock 仍显式类型 `vi.fn<FetchFn>` |
docs/audits/2026-11-05-data-foundation-3-plan/03-codex-plan-audit-round2.md:10:| P4 | RESOLVED | Hook and audit-marker writes use atomic detail patches (`plan:2344–2356`, `12745`, `12769`, `15735`). |
docs/audits/2026-11-05-data-foundation-3-plan/05-codex-plan-audit-round4.md:8:| R2 | RESOLVED | Setter locks the security row and atomically merges one provenance key; apply uses the RPC (`2431–2455`, `5421–5432`). Concurrent writes and claim-resolution interleavings are covered. |
docs/audits/2026-11-05-data-foundation-3/raw/openfigi-isin-5afdb0e5d0f9ae85a2b4cb13848b5df2bdd7bb119b2ac1d7c932fc8a1993139a.json:1:[{"data":[{"figi":"BBG000B9XRY4","name":"APPLE INC","ticker":"AAPL","exchCode":"US","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XSK7","name":"APPLE INC","ticker":"AAPL","exchCode":"UA","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XT70","name":"APPLE INC","ticker":"AAPL","exchCode":"UC","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XVV8","name":"APPLE INC","ticker":"AAPL","exchCode":"UN","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XWM6","name":"APPLE INC","ticker":"AAPL","exchCode":"UP","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XXW3","name":"APPLE INC","ticker":"AAPL","exchCode":"UB","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XYZ8","name":"APPLE INC","ticker":"AAPL","exchCode":"UM","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9XZT2","name":"APPLE INC","ticker":"AAPL","exchCode":"UX","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y2J5","name":"APPLE INC","ticker":"AAPL","exchCode":"UD","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y5X2","name":"APPLE INC","ticker":"AAPL","exchCode":"UW","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y6P9","name":"APPLE INC","ticker":"AAPL","exchCode":"UF","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y7F8","name":"APPLE INC","ticker":"AAPL","exchCode":"VY","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y7W9","name":"APPLE INC","ticker":"AAPL","exchCode":"VJ","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000B9Y8J2","name":"APPLE INC","ticker":"AAPL","exchCode":"VK","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000DGZJ27","name":"APPLE INC","ticker":"APC","exchCode":"GR","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0KP5","name":"APPLE INC","ticker":"APC","exchCode":"GF","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0L82","name":"APPLE INC","ticker":"APC","exchCode":"GD","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0LL7","name":"APPLE INC","ticker":"APC","exchCode":"GY","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0LW5","name":"APPLE INC","ticker":"APC","exchCode":"GS","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0MF2","name":"APPLE INC","ticker":"APC","exchCode":"GM","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0NM2","name":"APPLE INC","ticker":"APC","exchCode":"GI","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000DH0P83","name":"APPLE INC","ticker":"APC","exchCode":"GH","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG000KWV421","name":"APPLE INC","ticker":"AAPL*","exchCode":"MM","compositeFIGI":"BBG000KWV421","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL*"},{"figi":"BBG000KWV4C0","name":"APPLE INC","ticker":"AAPL*","exchCode":"MF","compositeFIGI":"BBG000KWV421","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL*"},{"figi":"BBG000LF8110","name":"APPLE INC","ticker":"AAPL","exchCode":"SW","compositeFIGI":"BBG000LF8110","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N88V36","name":"APPLE INC","ticker":"AAPL","exchCode":"EO","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N88X32","name":"APPLE INC","ticker":"AAPL","exchCode":"XH","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N88Y03","name":"APPLE INC","ticker":"AAPL","exchCode":"XC","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N88Y58","name":"APPLE INC","ticker":"AAPL","exchCode":"XF","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N88Z91","name":"APPLE INC","ticker":"AAPL","exchCode":"XE","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N890G9","name":"APPLE INC","ticker":"AAPL","exchCode":"XJ","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N890P9","name":"APPLE INC","ticker":"AAPL","exchCode":"XL","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N89140","name":"APPLE INC","ticker":"AAPL","exchCode":"XG","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N891K2","name":"APPLE INC","ticker":"AAPL","exchCode":"XO","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N895L2","name":"APPLE INC","ticker":"AAPL","exchCode":"XA","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N896W8","name":"APPLE INC","ticker":"AAPL","exchCode":"E1","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N897T0","name":"APPLE INC","ticker":"AAPL","exchCode":"XW","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000N898Y2","name":"APPLE INC","ticker":"AAPL","exchCode":"EU","compositeFIGI":"BBG000N898C6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG000NH05F8","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"EU","compositeFIGI":"BBG000NH0568","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV2R4","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"EO","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV409","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XH","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV631","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XJ","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV6B2","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XL","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV6Q6","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XG","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJV846","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XO","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJWGL8","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XA","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJWH90","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"E1","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NJWJ32","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XW","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG000NP33F2","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"EO","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP36L8","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XH","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP3718","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XC","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP37M5","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XF","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP38Y0","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XE","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP39Q7","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XJ","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP4D41","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XL","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP5GW2","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XG","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP5K80","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XA","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP5L24","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"E1","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000NP5MR5","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XW","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG000P092T6","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"EO","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG000P09C78","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"XO","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG000P0BHG4","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"E1","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG000P0BJY0","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"XW","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG000P0J812","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"EU","compositeFIGI":"BBG000P0J6X1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG000P85RM5","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"EO","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG000P862P6","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"E1","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG000P864K7","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"XW","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG000QFTD07","name":"APPLE INC","ticker":"4AAPL","exchCode":"TE","compositeFIGI":"BBG000QFTCC6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"4AAPL"},{"figi":"BBG000RYL9F6","name":"APPLE INC","ticker":"APC","exchCode":"TH","compositeFIGI":"BBG000RYL8W9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG001BCVZR7","name":"APPLE INC","ticker":"APCD","exchCode":"IX","compositeFIGI":"BBG001BCVZQ8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG001BHSV71","name":"APPLE INC","ticker":"AAPLCO","exchCode":"CB","compositeFIGI":"BBG001BHSV71","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCO"},{"figi":"BBG001BHSV80","name":"APPLE INC","ticker":"AAPLCO","exchCode":"CX","compositeFIGI":"BBG001BHSV71","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCO"},{"figi":"BBG002G55RD7","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XU","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG002JV1HL4","name":"APPLE INC","ticker":"AAPL","exchCode":"SE","compositeFIGI":"BBG000LF8110","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG002W8W0G9","name":"APPLE INC","ticker":"AAPL","exchCode":"RO","compositeFIGI":"BBG002W8W0G9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG002W8W0H8","name":"APPLE INC","ticker":"AAPL","exchCode":"RE","compositeFIGI":"BBG002W8W0G9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG0032FLQC3","name":"APPLE INC","ticker":"AAPL","exchCode":"CI","compositeFIGI":"BBG0032FLQC3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG0032FLQD2","name":"APPLE INC","ticker":"AAPL","exchCode":"CC","compositeFIGI":"BBG0032FLQC3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG0032FLQF0","name":"APPLE INC","ticker":"AAPL","exchCode":"CE","compositeFIGI":"BBG0032FLQC3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00591FL58","name":"APPLE INC","ticker":"AAPL","exchCode":"XV","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00591R2Q4","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"XV","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG00591RRB5","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"XV","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG006M6ZN36","name":"APPLE INC","ticker":"AAPL","exchCode":"BW","compositeFIGI":"BBG000LF8110","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG0077H2WP9","name":"APPLE INC","ticker":"APC","exchCode":"QT","compositeFIGI":"BBG0077H2WN1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG009CHNPJ8","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"SW","compositeFIGI":"BBG009CHNPJ8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG009CHNPL5","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"SE","compositeFIGI":"BBG009CHNPJ8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG009S1W8D0","name":"APPLE INC","ticker":"AAPL","exchCode":"PE","compositeFIGI":"BBG009S1W8C1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00DGYS838","name":"APPLE INC","ticker":"AAPLUSD","exchCode":"SW","compositeFIGI":"BBG00DGYS838","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLUSD"},{"figi":"BBG00DGYS856","name":"APPLE INC","ticker":"AAPLUSD","exchCode":"SE","compositeFIGI":"BBG00DGYS838","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLUSD"},{"figi":"BBG00DJCT4Z6","name":"APPLE INC","ticker":"AAPL","exchCode":"VF","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00FGWYHR4","name":"APPLE INC","ticker":"APC","exchCode":"GZ","compositeFIGI":"BBG00FGWYHQ5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG00GQ6RZH7","name":"APPLE INC","ticker":"AAPL","exchCode":"AV","compositeFIGI":"BBG00GQ6RZG8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00J7BK3P0","name":"APPLE INC","ticker":"1AAPL","exchCode":"IM","compositeFIGI":"BBG00J7BK3N2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPL"},{"figi":"BBG00J7BK3R8","name":"APPLE INC","ticker":"1AAPL","exchCode":"IF","compositeFIGI":"BBG00J7BK3N2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPL"},{"figi":"BBG00JN7C744","name":"APPLE INC","ticker":"AAPL","exchCode":"XX","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00JN7KZ34","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"XX","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00JN7L441","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"XX","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG00JN7NQR5","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"XX","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG00JN7PDD7","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"XX","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG00JPR0LX8","name":"APPLE INC","ticker":"0R2V","exchCode":"LN","compositeFIGI":"BBG00JPR0LW9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"0R2V"},{"figi":"BBG00JPY8TW9","name":"APPLE INC","ticker":"0R2VL","exchCode":"L3","compositeFIGI":"BBG00JPY8TV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"0R2VL"},{"figi":"BBG00JPY8XQ7","name":"APPLE INC","ticker":"0R2VL","exchCode":"B3","compositeFIGI":"BBG00JPY8XP8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"0R2VL"},{"figi":"BBG00JPY9104","name":"APPLE INC","ticker":"0R2VL","exchCode":"PO","compositeFIGI":"BBG00JPY90Z8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"0R2VL"},{"figi":"BBG00JX0P539","name":"APPLE INC","ticker":"AAPL*","exchCode":"MU","compositeFIGI":"BBG000KWV421","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL*"},{"figi":"BBG00JZ3XMD4","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"EO","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMH0","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XH","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMK6","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XF","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMM4","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XE","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMN3","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XJ","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMP1","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XL","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMQ0","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XG","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMR9","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XO","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMX2","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XA","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XMY1","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"E1","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN06","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XW","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN15","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XU","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN24","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XV","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN51","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XQ","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN60","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XX","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN79","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"XZ","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00JZ3XN97","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"EU","compositeFIGI":"BBG00JZ3XN88","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00KXBTYT7","name":"APPLE INC","ticker":"AAPL1GBP","exchCode":"EU","compositeFIGI":"BBG00KXBTYS8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL1GBP"},{"figi":"BBG00PPYC179","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"EP","compositeFIGI":"BBG00PPYC160","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00PPYC197","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"EZ","compositeFIGI":"BBG00PPYC188","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00PPYC1C3","name":"APPLE INC","ticker":"AAPL","exchCode":"EP","compositeFIGI":"BBG00PPYC1B4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00PPYC1F0","name":"APPLE INC","ticker":"AAPL","exchCode":"EZ","compositeFIGI":"BBG00PPYC1D2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00PPYC1H8","name":"APPLE INC","ticker":"AAPLRON","exchCode":"EP","compositeFIGI":"BBG00PPYC1G9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1K4","name":"APPLE INC","ticker":"AAPLRON","exchCode":"EZ","compositeFIGI":"BBG00PPYC1J6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1L3","name":"APPLE INC","ticker":"AAPLRON","exchCode":"EO","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1P9","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XH","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1R7","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XF","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1S6","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XD","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1T5","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XE","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1V2","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XJ","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1W1","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XL","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1X0","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XG","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1Y9","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XO","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC1Z8","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XN","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC222","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XA","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC231","name":"APPLE INC","ticker":"AAPLRON","exchCode":"E1","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC259","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XW","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC268","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XU","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC277","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XV","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC295","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XQ","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC2B2","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XX","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC2C1","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XZ","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC2F8","name":"APPLE INC","ticker":"AAPLRON","exchCode":"EU","compositeFIGI":"BBG00PPYC2D0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00PPYC2H6","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"EP","compositeFIGI":"BBG00PPYC2G7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG00PPYC2K2","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"EZ","compositeFIGI":"BBG00PPYC2J4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG00PVKFJF1","name":"APPLE INC","ticker":"AAPL","exchCode":"UZ","compositeFIGI":"BBG00PVKFJD3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00Q5MLT65","name":"APPLE INC","ticker":"AAPL","exchCode":"X2","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00Q6R8784","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"X2","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00Q6SMVJ1","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"X2","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00Q6V6R38","name":"APPLE INC","ticker":"AAPLRON","exchCode":"XY","compositeFIGI":"BBG00PPYC1L3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRON"},{"figi":"BBG00QFY5XM9","name":"APPLE INC","ticker":"AAPL","exchCode":"X1","compositeFIGI":"BBG000N88V36","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00QFYDNX0","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"X1","compositeFIGI":"BBG000NJV2R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00QFYDTY6","name":"APPLE INC","ticker":"AAPLGBX","exchCode":"X1","compositeFIGI":"BBG000NP33F2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBX"},{"figi":"BBG00QFYHG70","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"X1","compositeFIGI":"BBG000P092T6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG00QFYJ3W9","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"X1","compositeFIGI":"BBG000P85RM5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG00QFZTGD7","name":"APPLE INC","ticker":"AAPLRUB","exchCode":"X1","compositeFIGI":"BBG00JZ3XMD4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLRUB"},{"figi":"BBG00R0YT003","name":"APPLE INC","ticker":"APCD","exchCode":"PO","compositeFIGI":"BBG00R0YSZZ9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG00R0YTZN1","name":"APPLE INC","ticker":"APCD","exchCode":"L3","compositeFIGI":"BBG00R0YTZM2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG00R0YVCJ4","name":"APPLE INC","ticker":"APCD","exchCode":"B3","compositeFIGI":"BBG00R0YVCH6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG00THD0WF2","name":"APPLE INC","ticker":"AAPL","exchCode":"VL","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00X1L4PD5","name":"APPLE INC","ticker":"AAPL","exchCode":"VG","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00X1PKZF4","name":"APPLE INC","ticker":"AAPL","exchCode":"VP","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG00Y7B5HW5","name":"APPLE INC","ticker":"0R2VL","exchCode":"L1","compositeFIGI":"BBG00Y7B5HV6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"0R2VL"},{"figi":"BBG00Y7BDC48","name":"APPLE INC","ticker":"APCD","exchCode":"L1","compositeFIGI":"BBG00Y7BDC39","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG00YFSB7R0","name":"APPLE INC","ticker":"AAPLCL","exchCode":"CI","compositeFIGI":"BBG00YFSB7R0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCL"},{"figi":"BBG00YFSB7S9","name":"APPLE INC","ticker":"AAPLCL","exchCode":"CC","compositeFIGI":"BBG00YFSB7R0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCL"},{"figi":"BBG00YJ5VRX3","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"X9","compositeFIGI":"BBG00YJ5VRW4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG00YJ6HW20","name":"APPLE INC","ticker":"AAPL","exchCode":"X9","compositeFIGI":"BBG00YJ6HW11","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG013QF8P33","name":"APPLE INC","ticker":"AAPL_KZ","exchCode":"KZ","compositeFIGI":"BBG013QF8P24","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL_KZ"},{"figi":"BBG014K9CWV0","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"EO","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CWW9","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"X2","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CWY7","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XH","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX02","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XF","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX20","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XE","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX39","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XJ","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX48","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XL","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX57","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XG","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CX66","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XO","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXB0","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XA","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXC9","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"E1","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXF6","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XW","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXH4","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XU","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXK0","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XV","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXN7","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XQ","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXP5","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XX","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXQ4","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"XZ","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CXT1","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"X1","compositeFIGI":"BBG014K9CWV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG014K9CYN5","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"EU","compositeFIGI":"BBG014K9CYM6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG018H7JMZ0","name":"APPLE INC","ticker":"APC","exchCode":"LA","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG018J15QG8","name":"APPLE INC","ticker":"APC","exchCode":"LU","compositeFIGI":"BBG000DGZJ27","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG018Z8WZ66","name":"APPLE INC","ticker":"1AAPLM","exchCode":"BQ","compositeFIGI":"BBG018Z8WZ57","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG018Z9PT48","name":"APPLE INC","ticker":"APCD","exchCode":"BQ","compositeFIGI":"BBG018Z9PT39","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01FRZFGS6","name":"APPLE INC","ticker":"APCD","exchCode":"EB","compositeFIGI":"BBG01FRZFGR7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01FRZGN19","name":"APPLE INC","ticker":"APCD","exchCode":"I2","compositeFIGI":"BBG01FRZGN00","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01FSR18B4","name":"APPLE INC","ticker":"APCD","exchCode":"S1","compositeFIGI":"BBG01FSR1897","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01FSR19B2","name":"APPLE INC","ticker":"APCD","exchCode":"S4","compositeFIGI":"BBG01FSR1986","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01JWTPDZ4","name":"APPLE INC","ticker":"APCD","exchCode":"QX","compositeFIGI":"BBG01JWTPDY5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01JWTPHK1","name":"APPLE INC","ticker":"APCD","exchCode":"QE","compositeFIGI":"BBG01JWTPHJ3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG01K1CD966","name":"APPLE INC","ticker":"1AAPLM","exchCode":"PO","compositeFIGI":"BBG01K1CD957","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG01K1CDBN2","name":"APPLE INC","ticker":"1AAPLM","exchCode":"B3","compositeFIGI":"BBG01K1CDBM3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG01K1CDTB6","name":"APPLE INC","ticker":"1AAPLM","exchCode":"L3","compositeFIGI":"BBG01K1CDT99","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG01K1CDVR4","name":"APPLE INC","ticker":"1AAPLM","exchCode":"L1","compositeFIGI":"BBG01K1CDVQ5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG01NX6JHN5","name":"APPLE INC","ticker":"AAPL","exchCode":"PW","compositeFIGI":"BBG01NX6JHM6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG01NYDFYM7","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"EO","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYN6","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"X2","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYQ3","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XH","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYS1","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XF","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYW6","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XJ","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYX5","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XL","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYY4","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XG","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFYZ3","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XO","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ35","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XA","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ44","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"E1","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ62","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XW","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ71","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XU","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ80","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XY","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZ99","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XV","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZC5","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XQ","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZD4","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XX","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZG1","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"XZ","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZJ8","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"X1","compositeFIGI":"BBG01NYDFYM7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01NYDFZW3","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"EU","compositeFIGI":"BBG01NYDFZV4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG01P7GQJG3","name":"APPLE INC","ticker":"APC","exchCode":"BU","compositeFIGI":"BBG01P7GQJF4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APC"},{"figi":"BBG01QDBQCP0","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"EO","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQCR8","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"X2","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQCT6","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XH","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQCW2","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XF","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQCZ9","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XJ","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQD05","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XL","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQD14","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XG","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQD23","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XO","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQD78","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XA","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQD87","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"E1","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDC2","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XW","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDD1","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XU","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDF9","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XY","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDG8","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XV","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDK3","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XQ","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDL2","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XX","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDM1","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"XZ","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQDP8","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"X1","compositeFIGI":"BBG01QDBQCP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01QDBQFY3","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"EU","compositeFIGI":"BBG01QDBQFX4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG01V7VYB11","name":"APPLE INC","ticker":"AAPL","exchCode":"OC","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG01X4J7994","name":"APPLE INC","ticker":"AAPL","exchCode":"OD","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG021C07FG3","name":"APPLE INC","ticker":"AAPL","exchCode":"VT","compositeFIGI":"BBG000B9XRY4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG022QS1733","name":"APPLE INC","ticker":"AAPLN","exchCode":"BQ","compositeFIGI":"BBG022QS1724","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLN"},{"figi":"BBG023NB6TZ3","name":"APPLE INC","ticker":"AAPLV","exchCode":"PO","compositeFIGI":"BBG023NB6TX5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLV"},{"figi":"BBG023NB6W77","name":"APPLE INC","ticker":"AAPLV","exchCode":"L1","compositeFIGI":"BBG023NB6W59","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLV"},{"figi":"BBG023NB6XN7","name":"APPLE INC","ticker":"AAPLV","exchCode":"L3","compositeFIGI":"BBG023NB6XM8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLV"},{"figi":"BBG023NB6Z89","name":"APPLE INC","ticker":"AAPLV","exchCode":"B3","compositeFIGI":"BBG023NB6Z70","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLV"},{"figi":"BBG023S1CKT9","name":"APPLE INC","ticker":"AAPLZ","exchCode":"PO","compositeFIGI":"BBG023S1CKR1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG023S1CNC1","name":"APPLE INC","ticker":"AAPLZ","exchCode":"L1","compositeFIGI":"BBG023S1CNB2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG023S1CR50","name":"APPLE INC","ticker":"AAPLZ","exchCode":"L3","compositeFIGI":"BBG023S1CR41","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG023S1CV15","name":"APPLE INC","ticker":"AAPLZ","exchCode":"B3","compositeFIGI":"BBG023S1CV06","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG023ZB6TW3","name":"APPLE INC","ticker":"AAPLZ","exchCode":"S1","compositeFIGI":"BBG023ZB6TV4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG024DKH1C6","name":"APPLE INC","ticker":"1AAPLM","exchCode":"EB","compositeFIGI":"BBG024DKH1B7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG024DKHFV4","name":"APPLE INC","ticker":"1AAPLM","exchCode":"I2","compositeFIGI":"BBG024DKHFS8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG024DKHWK9","name":"APPLE INC","ticker":"1AAPLM","exchCode":"IX","compositeFIGI":"BBG024DKHWJ1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG024XZL5B8","name":"APPLE INC","ticker":"AAPLCHF","exchCode":"ER","compositeFIGI":"BBG024XZL591","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCHF"},{"figi":"BBG024Y0GKW4","name":"APPLE INC","ticker":"AAPLHUF","exchCode":"ER","compositeFIGI":"BBG024Y0GKV5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLHUF"},{"figi":"BBG024Y0T0T8","name":"APPLE INC","ticker":"AAPLGBP","exchCode":"ER","compositeFIGI":"BBG024Y0T0R0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLGBP"},{"figi":"BBG024Y10PK1","name":"APPLE INC","ticker":"AAPLEUR","exchCode":"ER","compositeFIGI":"BBG024Y10PJ3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLEUR"},{"figi":"BBG024YSR126","name":"APPLE INC","ticker":"AAPLDEUR","exchCode":"ER","compositeFIGI":"BBG024YSR108","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLDEUR"},{"figi":"BBG0250750M0","name":"APPLE INC","ticker":"AAPLVEUR","exchCode":"ER","compositeFIGI":"BBG0250750L1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLVEUR"},{"figi":"BBG0250F63Q1","name":"APPLE INC","ticker":"AAPL","exchCode":"ER","compositeFIGI":"BBG0250F63P2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPL"},{"figi":"BBG0250FC6H7","name":"APPLE INC","ticker":"AAPLMEUR","exchCode":"ER","compositeFIGI":"BBG0250FC6G8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMEUR"},{"figi":"BBG0250JLKH8","name":"APPLE INC","ticker":"AAPLMXN","exchCode":"ER","compositeFIGI":"BBG0250JLKG9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLMXN"},{"figi":"BBG0252YV5V9","name":"APPLE INC","ticker":"AAPLL","exchCode":"ER","compositeFIGI":"BBG0252YV5T2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLL"},{"figi":"BBG0253BBKM7","name":"APPLE INC","ticker":"AAPLZEUR","exchCode":"ER","compositeFIGI":"BBG0253BBKK9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZEUR"},{"figi":"BBG0253BD673","name":"APPLE INC","ticker":"AAPLZ","exchCode":"ER","compositeFIGI":"BBG0253BD646","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLZ"},{"figi":"BBG025BLHC48","name":"APPLE INC","ticker":"1AAPLM","exchCode":"QX","compositeFIGI":"BBG025BLHC39","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG025BLHJM3","name":"APPLE INC","ticker":"1AAPLM","exchCode":"QE","compositeFIGI":"BBG025BLHJL4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"1AAPLM"},{"figi":"BBG025KC3KT8","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"EO","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3KV5","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"X2","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3KX3","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XH","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3KZ1","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XF","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3L25","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XJ","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3L34","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XL","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3L43","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XG","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3L52","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XO","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3L98","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XA","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LB5","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"E1","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LD3","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XW","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LF1","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XU","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LG0","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XY","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LH9","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XV","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LK5","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XQ","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LL4","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XX","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LM3","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"XZ","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3LP0","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"X1","compositeFIGI":"BBG025KC3KT8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC3MG8","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"EU","compositeFIGI":"BBG025KC3MC2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG025KC7NP2","name":"APPLE INC","ticker":"AAPLPLN","exchCode":"ER","compositeFIGI":"BBG025KC7NN4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLPLN"},{"figi":"BBG025V0CT95","name":"APPLE INC","ticker":"AAPMZ","exchCode":"PO","compositeFIGI":"BBG025V0CT86","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPMZ"},{"figi":"BBG025V0CTW9","name":"APPLE INC","ticker":"AAPMZ","exchCode":"L1","compositeFIGI":"BBG025V0CTV0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPMZ"},{"figi":"BBG025V0CVR0","name":"APPLE INC","ticker":"AAPMZ","exchCode":"L3","compositeFIGI":"BBG025V0CVQ1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPMZ"},{"figi":"BBG025V0CW89","name":"APPLE INC","ticker":"AAPMZ","exchCode":"B3","compositeFIGI":"BBG025V0CW70","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPMZ"},{"figi":"BBG0265H4CL7","name":"APPLE INC","ticker":"AAPLCAD","exchCode":"ER","compositeFIGI":"BBG0265H4CK8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"AAPLCAD"},{"figi":"BBG0266NX6D3","name":"APPLE INC","ticker":"APCD","exchCode":"TQ","compositeFIGI":"BBG0266NX6C4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"},{"figi":"BBG0266NXLJ4","name":"APPLE INC","ticker":"APCD","exchCode":"T1","compositeFIGI":"BBG0266NXLH6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S5N8V8","securityType2":"Common Stock","securityDescription":"APCD"}]},{"data":[{"figi":"BBG000BC4595","name":"KWEICHOW MOUTAI CO LTD-A","ticker":"600519","exchCode":"CH","compositeFIGI":"BBG000BC4595","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S65JV2","securityType2":"Common Stock","securityDescription":"600519"},{"figi":"BBG000BC45Q6","name":"KWEICHOW MOUTAI CO LTD-A","ticker":"600519","exchCode":"CG","compositeFIGI":"BBG000BC4595","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S65JV2","securityType2":"Common Stock","securityDescription":"600519"},{"figi":"BBG00709HTQ4","name":"KWEICHOW MOUTAI CO LTD-A","ticker":"600519","exchCode":"C1","compositeFIGI":"BBG00709HTP5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S65JV2","securityType2":"Common Stock","securityDescription":"600519"}]},{"data":[{"figi":"BBG000BJ35N5","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"HK","compositeFIGI":"BBG000BJ35F4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG000PXBXK2","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GR","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXBXW9","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GF","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXBY48","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GD","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXBZV5","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GS","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXBZZ1","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GM","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXC1M9","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GI","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000PXC2C8","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GH","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG000QMWZW4","name":"TENCENT HOLDINGS LTD","ticker":"TCTZF","exchCode":"US","compositeFIGI":"BBG000QMWZW4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TCTZF"},{"figi":"BBG000QMX4L4","name":"TENCENT HOLDINGS LTD","ticker":"TCTZF","exchCode":"PQ","compositeFIGI":"BBG000QMWZW4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TCTZF"},{"figi":"BBG000QMX639","name":"TENCENT HOLDINGS LTD","ticker":"TCTZF","exchCode":"UV","compositeFIGI":"BBG000QMWZW4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TCTZF"},{"figi":"BBG000V58R78","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"TH","compositeFIGI":"BBG000V58QK5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG006M7NHW8","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"EO","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NHZ5","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XH","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ18","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XF","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ36","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XE","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ45","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XJ","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ54","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XL","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ63","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XG","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJ72","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XO","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJC6","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XS","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJD5","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XA","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJF3","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"E1","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJH1","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XW","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJJ9","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XU","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJL6","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XV","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006M7NJP2","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"EU","compositeFIGI":"BBG006M7NJN4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG006Z3JNS0","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"H1","compositeFIGI":"BBG006Z3JNR1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG0077H2RQ9","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"QT","compositeFIGI":"BBG0077H2RP0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG00DY62TD0","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"H2","compositeFIGI":"BBG00DY62T40","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG00JN87007","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"XX","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG00JNNLC48","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"X2","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLC75","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XH","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLC93","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XF","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCC9","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XE","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCD8","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XJ","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCF6","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XL","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCG5","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XG","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCH4","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XO","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCM8","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XS","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCN7","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XA","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCP5","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"E1","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCR3","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XW","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCS2","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XU","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCT1","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XV","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCX6","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XQ","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCY5","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XX","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLCZ4","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"XZ","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JNNLD19","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"EU","compositeFIGI":"BBG00JNNLD00","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00JRFXSP0","name":"TENCENT HOLDINGS LTD","ticker":"700N","exchCode":"PO","compositeFIGI":"BBG00JRFXSN2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700N"},{"figi":"BBG00JRG3349","name":"TENCENT HOLDINGS LTD","ticker":"700N","exchCode":"L3","compositeFIGI":"BBG00JRG3330","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700N"},{"figi":"BBG00JRG6CW5","name":"TENCENT HOLDINGS LTD","ticker":"700N","exchCode":"B3","compositeFIGI":"BBG00JRG6CV6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700N"},{"figi":"BBG00JVPMPK6","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"X2","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPN3","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XH","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPQ0","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XF","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPS8","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XE","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPT7","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XJ","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPV4","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XL","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPW3","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XG","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMPX2","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XO","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ15","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XS","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ24","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XA","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ33","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"E1","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ51","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XW","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ60","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XU","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQ79","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XV","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQB4","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XQ","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQC3","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XX","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQD2","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"XZ","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JVPMQG9","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"EU","compositeFIGI":"BBG00JVPMQF0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00JWTHP14","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"X2","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHP41","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XH","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHP69","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XF","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHP87","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XE","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHP96","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XJ","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPB3","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XL","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPC2","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XG","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPD1","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XO","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPJ5","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XS","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPK3","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XA","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPL2","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"E1","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPN0","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XW","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPQ7","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XU","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPR6","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XV","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPV1","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XQ","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPW0","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XX","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPX9","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"XZ","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JWTHPZ7","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"EU","compositeFIGI":"BBG00JWTHPY8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00JX61FS3","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"X2","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61FW8","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XH","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61FY6","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XF","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G01","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XE","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G10","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XJ","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G29","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XL","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G38","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XG","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G47","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XO","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G83","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XS","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61G92","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XA","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GB9","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"E1","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GD7","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XW","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GF5","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XU","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GG4","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XV","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GK9","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XQ","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GL8","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XX","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GM7","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"XZ","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00JX61GP4","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"EU","compositeFIGI":"BBG00JX61GN6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00LQGSB86","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"GZ","compositeFIGI":"BBG00LQGSB77","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG00M8LGZ74","name":"TENCENT HOLDINGS LTD","ticker":"TENCHN","exchCode":"MM","compositeFIGI":"BBG00M8LGZ74","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TENCHN"},{"figi":"BBG00M8LGZ83","name":"TENCENT HOLDINGS LTD","ticker":"TENCHN","exchCode":"MF","compositeFIGI":"BBG00M8LGZ74","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TENCHN"},{"figi":"BBG00M8LGZ92","name":"TENCENT HOLDINGS LTD","ticker":"TENCHN","exchCode":"MU","compositeFIGI":"BBG00M8LGZ74","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"TENCHN"},{"figi":"BBG00N6TFYC5","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"AV","compositeFIGI":"BBG00N6TFYB6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG00NRVWQY1","name":"TENCENT HOLDINGS LTD","ticker":"0Z4S","exchCode":"LO","compositeFIGI":"BBG00JRK86P5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"0Z4S"},{"figi":"BBG00PPZNMG8","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"EP","compositeFIGI":"BBG00PPZNMF9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG00PPZNMJ5","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"EZ","compositeFIGI":"BBG00PPZNMH7","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG00PPZNML2","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"EP","compositeFIGI":"BBG00PPZNMK3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00PPZNMN0","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"EZ","compositeFIGI":"BBG00PPZNMM1","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00PZSDPK2","name":"TENCENT HOLDINGS LTD","ticker":"NNNDV","exchCode":"PO","compositeFIGI":"BBG00PZSDPJ4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDV"},{"figi":"BBG00PZSDPP7","name":"TENCENT HOLDINGS LTD","ticker":"NNNDV","exchCode":"L3","compositeFIGI":"BBG00PZSDPN9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDV"},{"figi":"BBG00PZSDPS4","name":"TENCENT HOLDINGS LTD","ticker":"NNNDV","exchCode":"B3","compositeFIGI":"BBG00PZSDPR5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDV"},{"figi":"BBG00Q6SD0D5","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"X2","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00QFZ1VV4","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"X1","compositeFIGI":"BBG006M7NHW8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG00QFZKMR8","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"X1","compositeFIGI":"BBG00JNNLC48","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG00QFZRF41","name":"TENCENT HOLDINGS LTD","ticker":"700RUB","exchCode":"X1","compositeFIGI":"BBG00JVPMPK6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700RUB"},{"figi":"BBG00QFZS7S2","name":"TENCENT HOLDINGS LTD","ticker":"700GBX","exchCode":"X1","compositeFIGI":"BBG00JWTHP14","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700GBX"},{"figi":"BBG00QFZSD54","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"X1","compositeFIGI":"BBG00JX61FS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00S7N1LY5","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"EP","compositeFIGI":"BBG00S7N1LX6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M00","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"EZ","compositeFIGI":"BBG00S7N1LZ4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M19","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XS","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M28","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"X2","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M46","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XH","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M64","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XF","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M82","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XE","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1M91","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XJ","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MB8","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XL","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MC7","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XG","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MD6","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XO","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MJ0","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XA","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MK8","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"E1","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MM6","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XW","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MN5","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XU","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MQ2","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XV","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MS0","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XQ","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MT9","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XX","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MV6","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"XZ","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1MX4","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"X1","compositeFIGI":"BBG00S7N1M19","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00S7N1NF2","name":"TENCENT HOLDINGS LTD","ticker":"700JPY","exchCode":"EU","compositeFIGI":"BBG00S7N1ND4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700JPY"},{"figi":"BBG00TN4WLX4","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"EP","compositeFIGI":"BBG00TN4WLW5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00TN4WLZ2","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"EZ","compositeFIGI":"BBG00TN4WLY3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG00Y7B0B17","name":"TENCENT HOLDINGS LTD","ticker":"700N","exchCode":"L1","compositeFIGI":"BBG00Y7B0B08","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700N"},{"figi":"BBG00Y92GX47","name":"TENCENT HOLDINGS LTD","ticker":"NNNDV","exchCode":"L1","compositeFIGI":"BBG00Y92GX38","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDV"},{"figi":"BBG00YJ5SVX8","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"X9","compositeFIGI":"BBG00YJ5SVW9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG00YNGF8P3","name":"TENCENT HOLDINGS LTD","ticker":"700HKD","exchCode":"X9","compositeFIGI":"BBG00YNGF8N5","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700HKD"},{"figi":"BBG018H87FD0","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"LA","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG018J1WJ01","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"LU","compositeFIGI":"BBG000PXBXK2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG01BCB3D59","name":"TENCENT HOLDINGS LTD","ticker":"NNND","exchCode":"BU","compositeFIGI":"BBG01BCB3D40","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNND"},{"figi":"BBG01GXJQJS5","name":"TENCENT HOLDINGS LTD","ticker":"80700","exchCode":"HK","compositeFIGI":"BBG01GXJQJR6","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"80700"},{"figi":"BBG01QF09MY9","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"SW","compositeFIGI":"BBG01QF09MY9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG01QF09N40","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"BW","compositeFIGI":"BBG01QF09MY9","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG01R2TG1S3","name":"TENCENT HOLDINGS LTD","ticker":"NNNDD","exchCode":"PO","compositeFIGI":"BBG01R2TG1R4","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDD"},{"figi":"BBG01R2TG381","name":"TENCENT HOLDINGS LTD","ticker":"NNNDD","exchCode":"B3","compositeFIGI":"BBG01R2TG372","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDD"},{"figi":"BBG01R2TG4H9","name":"TENCENT HOLDINGS LTD","ticker":"NNNDD","exchCode":"L3","compositeFIGI":"BBG01R2TG4G0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDD"},{"figi":"BBG01R2TG5V0","name":"TENCENT HOLDINGS LTD","ticker":"NNNDD","exchCode":"L1","compositeFIGI":"BBG01R2TG5T3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"NNNDD"},{"figi":"BBG024YDN025","name":"TENCENT HOLDINGS LTD","ticker":"700VEUR","exchCode":"ER","compositeFIGI":"BBG024YDN007","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700VEUR"},{"figi":"BBG024YNL7P5","name":"TENCENT HOLDINGS LTD","ticker":"700USD","exchCode":"ER","compositeFIGI":"BBG024YNL7M8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700USD"},{"figi":"BBG024YRLTP8","name":"TENCENT HOLDINGS LTD","ticker":"700","exchCode":"ER","compositeFIGI":"BBG024YRLTN0","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700"},{"figi":"BBG024YSPD04","name":"TENCENT HOLDINGS LTD","ticker":"700EUR","exchCode":"ER","compositeFIGI":"BBG024YSPCZ8","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700EUR"},{"figi":"BBG0252YWNT2","name":"TENCENT HOLDINGS LTD","ticker":"700L","exchCode":"ER","compositeFIGI":"BBG0252YWNS3","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700L"},{"figi":"BBG025N2HFC1","name":"TENCENT HOLDINGS LTD","ticker":"700PLN","exchCode":"ER","compositeFIGI":"BBG025N2HFB2","securityType":"Common Stock","marketSector":"Equity","shareClassFIGI":"BBG001S8C4T6","securityType2":"Common Stock","securityDescription":"700PLN"}]}]
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:101:| M14 evidence reader | ACCEPT | New `read_filing_facts(filing, include_non_ok)` (all generations, all statuses); used for CN/US left-side binding and adoption duplicate checks (§3.2, §5.3, §5.4). |
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:102:| M15 expected keys from the adapter under test | ACCEPT | §5.3: expected keys = union of adapter-derived and iXBRL-derived keys (`origin` recorded); one-sided keys stay in the denominator and surface as `left_missing`/`right_missing`; ≥ 4 keys per side. |
docs/audits/2026-11-04-data-foundation-3/03-disposition.md:136:| T1 S2 conflicting binding text | P2 | ACCEPT | §3.2 `read_filing_facts` (filter to active generation + published runs, then cardinality), `adopt_candidate` (full candidate key incl. `mapping_gen`, across statuses), §5.1 outcome list `left_ambiguous`, §5.3, §5.4, §9.2 |
docs/audits/2026-11-04-data-foundation-2/01-codex-spec-audit-round1.md:12:| 8 | P1 blocking | §§3, 4.2, 5.3, 8 | **Currency is allowed to vary but is absent from the fact key and derivation guards.** A company can report the same concept in multiple units; SEC explicitly documents this. [SEC API documentation](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | Legitimate currency alternatives become ambiguity or “restatements.” Separate concepts selected from different filings can then be subtracted in different currencies. | Include reporting unit/basis in identity, or select one documented reporting currency per statement. Require compatible units across every formula and identity check; do not silently convert. Normalize non-USD per-share units too. |
docs/audits/2026-11-04-data-foundation-2/01-codex-spec-audit-round1.md:14:| 10 | P1 blocking | §8 | **US cash-flow quarter derivation is incomplete.** The spec handles US Q4 differences but assumes Q1–Q3 facts are already single-quarter. Apple’s 10-Q cash-flow statement is nine-month cumulative. [Apple Q3 2023 filing](https://www.sec.gov/Archives/edgar/data/320193/000032019323000077/aapl-20230701.htm) | US Q2/Q3 operating cash flow and its TTM series will be missing even when all required YTD facts exist. | Apply duration-aware YTD differencing to US cash flows too. Require matching fiscal-year starts, contiguous periods, units, and compatible accounting bases. Treat direct quarterly facts as inputs to TTM even when no duplicate `q_single` row is materialized. |
docs/audits/2026-11-04-data-foundation-2/01-codex-spec-audit-round1.md:43:- **SEC filing metadata:** Record examples of 10-K, 10-Q, 20-F/IFRS, amendments, and retained `other` forms. Check missing/inconsistent `fy/fp`, accession report dates, and the available acceptance timestamp. Keep `frame` out of identity and do not treat it as a fiscal-period authority.
docs/audits/2026-11-04-data-foundation-3/06-codex-round5.md:6:| S2 | PARTIAL | §3.2 adds correct binding rules, but adoption, §§5.3–5.4, and §9.2 retain contradictory all-generation instructions; see T1. |
docs/audits/2026-11-04-data-foundation-3/06-codex-round5.md:17:| T1 | P2 | §§3.2, 5.1, 5.3–5.4, 9.2 | **S2 has conflicting executable instructions.** Adoption still rejects duplicates “in any generation”; the pair descriptions still bind unrestricted results; the test expects ambiguity merely from multiple generations. The landed candidate uniqueness constraint includes `mapping_gen`: `supabase/migrations/20261106090000_financial_facts.sql:93`. | Replace those passages with: “Filter ordinary bindings to the filing’s active generation and published runs before testing cardinality. Explicit rechecks use the item’s exact fact IDs. Adoption checks the complete candidate key including generation, across statuses. An older-generation row alone neither blocks adoption nor produces ambiguity.” Add `left_ambiguous` to §5.1’s outcome list. |
docs/audits/2026-11-04-data-foundation-3/06-codex-round5.md:29:| T13 | P2 | Introduction; §§5.2–5.3, 12 | **The inherited catalogue count is wrong.** The pinned upstream body says 34 concepts; landed `FACT_CONCEPTS` contains 35 and derives the public limit from its length (`src/lib/facts/concepts.ts:21`, `:61`). More materially, CN `money_cap` maps to `monetary_funds`, while CN `cash` has no mapping (`:41`, `:43`); using the earlier catalogue can compare unlike quantities. | “Use the landed 35-entry `FACT_CONCEPTS` and `MAX_READ_CONCEPTS`; never hard-code 33/34. Preserve `monetary_funds` as distinct from cash equivalents and leave CN `cash` missing. Generate expected-key/tag mappings from the landed catalogue without restoring superseded aliases.” |
docs/audits/2026-11-04-data-foundation-3/04-codex-round3.md:19:| M15 | PARTIAL | §§5.3–5.4 fix DB-status dependence and CN completeness; US expectations still come from the same companyfacts adapter being evaluated, so adapter omissions can shrink expectations while the four-key minimum passes. |
docs/audits/2026-11-04-data-foundation-3/04-codex-round3.md:20:| M16 | RESOLVED | §5.3 stores natural keys and resolves environment-local fact IDs, with explicit missing outcomes. |
docs/audits/2026-11-05-data-foundation-3/implementation-log.md:18:| 6b load-sec 换码检测（E3） | 27d503e, 7c22918, 6b4e252 | ✅（commander 批准偏差：新增 SQL `patch_security_provenance`、`close_security_absent`（标记校验）；`set_security_window` 只做 delisting 并删除旧签名；迁移一原地改，更新锁） | Changes requested → 修复（拒绝路径留回执、claim 修复按本次关闭证据、全量分页、cadence 取自清单） | review P1 规范化 ticker 未用于确认；challenge P1 并发快照误关、拒绝行当缺失、ticker 身份不一致；P2 claim 不可恢复、签名重载、交易所文件未归档、last_seen 推断 → 两轮修复后无问题 | 3 |
docs/audits/2026-11-05-data-foundation-3/implementation-log.md:24:| 9a FactsDb 扩展（三实现） | 0bf3b19, d59339f, fe4d167, 0444c67 | ✅（偏差：新增错误码映射；内存实现对齐落地 SQL） | Changes requested → 修复（SQL apply_reconcile_result 显式两侧校验 invalid_result、filingsForCalendar 按键分页去重与缺运行行一致省略、内存主键、UUID 全边界小写、信封严格解析） | challenge P2 内存接受 numeric compared 空值；review 轮 3 P2 UUID 部分规范化回归 → 修复后无问题。迁移二原地改并更新锁 | 4 |
docs/audits/2026-11-05-data-foundation-3/implementation-log.md:27:| 11 resolveFactsItem 分派 + quarantine 路由 + --pending-hooks（E8） | 0094157, d513043, a4b2a10 | ❌→✅（batch_mismatch 恢复为 500） | Changes requested → 修复（patch_quarantine_detail 先删旧签名、扫描逐项容错、谱系物化用持久化目标、restore_note 统一于 detail） | challenge P2 旧扫描覆盖新 pending 钩子 → patch_quarantine_detail 增 p_expect_hook_at CAS（迁移一原地改）；P2 恢复审计用重试体、扫描吞写失败 → 修复后无问题 | 3 |
    68	 const universe=JSON.parse(readFileSync(universePath,'utf8')) as {constituents:{ticker:string;exchange?:string}[]};
    69	 const tickers=await json<Record<string,{cik_str:number;ticker:string}>>('https://www.sec.gov/files/company_tickers.json');
    70	 const cikOf=new Map(Object.values(tickers).map(t=>[t.ticker.toUpperCase(),String(t.cik_str)]));
    71	 const required=usGoldEntries(JSON.parse(readFileSync(US_GOLD_PATH,'utf8'))).entries.map(e=>e.ticker);
    72	 const subs=new Map<string,Submissions>();const candidates:SampleCandidate[]=[];const warnings:string[]=[];
    73	 for(const c of universe.constituents){
    74	  const ticker=c.ticker.toUpperCase().replace(/\./g,'-');const cik=cikOf.get(ticker);
    75	  if(!cik){warnings.push(`no CIK for ${c.ticker}`);continue;}
    76	  const s=await json<Submissions>(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`).catch(e=>{warnings.push(`${ticker}: ${(e as Error).message}`);return null;});
    77	  if(!s)continue;
    78	  subs.set(cik,s);
    79	  candidates.push({ticker,cik,exchange:c.exchange==='NASDAQ'?'Nasdaq':c.exchange??s.exchanges?.[0]??null,fiscalYearEnd:s.fiscalYearEnd??null,acceleration:filerClass(s.category)});
    80	 }
    81	 const {picked,unmet}=pickSample(candidates,required,n);
    82	 const sinceYear=new Date().getUTCFullYear()-10;
    83	 const issuers:SampleIssuer[]=[];
    84	 for(const p of picked){
    85	  const s=subs.get(p.cik)!;const recent=recentOf(s).filter(r=>r.inline);
    86	  const annual=recent.find(r=>r.form==='10-K'||r.form==='20-F');
    87	  if(!annual){warnings.push(`${p.ticker}: no inline 10-K/20-F in filings.recent`);continue;}
    88	  const regime=annual.form as '10-K'|'20-F';
    89	  const chosen=regime==='10-K'?[annual,recent.find(r=>r.form==='10-Q')].filter((x):x is Recent=>!!x):[annual];
    90	  const companyfacts=await fetchCompanyFacts(padCik(p.cik),budgetFor(120_000));
    91	  const filings:SampleFiling[]=[];
    92	  for(const r of chosen){
    93	   const url=`https://www.sec.gov/Archives/edgar/data/${p.cik}/${r.accn.replace(/-/g,'')}/${r.primaryDocument}`;
    94	   try{filings.push(buildSampleFiling({cik:p.cik,accn:r.accn,form:r.form,period_end:r.reportDate,primary_document:r.primaryDocument,doc_url:url,is_inline_xbrl:r.inline,submissions_category:s.category??null,companyfacts,doc:await get(url),sinceYear}));}
    95	   catch(e){warnings.push(`${p.ticker} ${r.accn}: ${(e as Error).message}`);}
    96	  }
    97	  if(filings.length>0)issuers.push({cik:p.cik,ticker:p.ticker,regime,filings});
    98	 }
    99	 return {sample:{schema:US_SAMPLE_SCHEMA,generated_at:new Date().toISOString(),selection:'live/1',issuers},unmet,warnings};
   100	}
   101	
import { buildAliases, normalizeSecurityTicker } from '../normalize';
import type { NormalizedSecurity, SecuritySnapshot } from '../model';
import { SecuritySourceError } from './tushare-client';

interface Sp500Constituent {
  ticker: string;
  name: string;
  exchange?: 'NASDAQ' | 'NYSE' | 'AMEX';
}

interface Sp500Payload {
  source_date: string;
  checksum: string;
  source_url?: string;
  constituents: Sp500Constituent[];
}

export interface Sp500Options {
  url?: string;
  storagePath?: string;
  approvedHosts?: string[];
  fetchImpl?: typeof fetch;
  storageLoader?: (path: string) => Promise<unknown>;
}

function parsePayload(value: unknown): Sp500Payload {
  if (!value || typeof value !== 'object') throw new SecuritySourceError('source_schema', 'sp500');
  const payload = value as Partial<Sp500Payload>;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.source_date ?? '')
    || !/^[a-f0-9]{64}$/i.test(payload.checksum ?? '')
    || !Array.isArray(payload.constituents)
    || payload.constituents.length < 490
    || payload.constituents.length > 510) {
    throw new SecuritySourceError('source_schema', 'sp500');
  }
  return payload as Sp500Payload;
}

async function loadPayload(options: Sp500Options): Promise<unknown> {
  const urlValue = options.url ?? process.env.SP500_CONSTITUENTS_URL;

codex
The live generator can report success for an incomplete sample and can reject valid universes when multiple selected tickers share a CIK. These issues need correction before relying on its generated manifests.

Full review comments:

- [P2] Recheck sample requirements after dropping issuers and filings — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/dq/select-us-sample.ts:97-99
  In live mode, missing inline annual filings, document fetch failures, or insufficient keys can remove selected issuers after `pickSample` has computed `unmet`. The returned `unmet` remains unchanged, so the command can exit successfully even after losing a required gold ticker or breaking an exchange/filer quota. A failed annual document can also leave a 10-K issuer with only its quarterly filing. Validate the retained sample's membership, quotas, and required filing coverage before reporting success, or replace failed selections.

- [P2] Deduplicate candidate issuers by CIK before sampling — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/dq/select-us-sample.ts:78-81
  An S&P 500 universe can contain multiple share classes of one issuer, such as GOOG and GOOGL, which resolve to the same CIK. Both are currently added as independent candidates. If both are selected, the generator fetches the same filings twice and produces duplicate natural keys; `validateUsSample` then rejects the entire manifest rather than writing it. Deduplicate by CIK before selection while preserving required-ticker membership so sampling operates on distinct issuers.
The live generator can report success for an incomplete sample and can reject valid universes when multiple selected tickers share a CIK. These issues need correction before relying on its generated manifests.

Full review comments:

- [P2] Recheck sample requirements after dropping issuers and filings — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/dq/select-us-sample.ts:97-99
  In live mode, missing inline annual filings, document fetch failures, or insufficient keys can remove selected issuers after `pickSample` has computed `unmet`. The returned `unmet` remains unchanged, so the command can exit successfully even after losing a required gold ticker or breaking an exchange/filer quota. A failed annual document can also leave a 10-K issuer with only its quarterly filing. Validate the retained sample's membership, quotas, and required filing coverage before reporting success, or replace failed selections.

- [P2] Deduplicate candidate issuers by CIK before sampling — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/scripts/dq/select-us-sample.ts:78-81
  An S&P 500 universe can contain multiple share classes of one issuer, such as GOOG and GOOGL, which resolve to the same CIK. Both are currently added as independent candidates. If both are selected, the generator fetches the same filings twice and produces duplicate natural keys; `validateUsSample` then rejects the entire manifest rather than writing it. Deduplicate by CIK before selection while preserving required-ticker membership so sampling operates on distinct issuers.

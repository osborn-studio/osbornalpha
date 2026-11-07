OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0e1-e9ec-7352-b7a4-05e1967c94ae
--------
user
commit 1abfcd0
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 1abfcd0; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2276ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-iVxnwtlc' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-x9fK2tvD' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-LdXBL7vu' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-oPCohOdw' (errno=Operation not permitted)
1abfcd0 fix(dq): iXBRL trimmer safety net, namespace scope, tuple/duplicate/nested handling, raw retention in recorder
 scripts/dq/record-ixbrl-fixture.ts      |  48 +++++++++--
 src/lib/dq/reconcile/ixbrl-trim.test.ts |  59 +++++++++++++-
 src/lib/dq/reconcile/ixbrl-trim.ts      | 140 ++++++++++++++++++++++++--------
 3 files changed, 207 insertions(+), 40 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -35; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do test ! -f "$d/$f" || cat "$d/$f"; done; done; git show 1abfcd0 --' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-F1xjqCNz' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-Or7Fwqs5' (errno=Operation not permitted)
commit 1abfcd0a7be167b35654b34aac7c83349d69424c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:42:20 2026 -0800

    fix(dq): iXBRL trimmer safety net, namespace scope, tuple/duplicate/nested handling, raw retention in recorder
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/record-ixbrl-fixture.ts b/scripts/dq/record-ixbrl-fixture.ts
index c899bdf..5bb3bca 100644
--- a/scripts/dq/record-ixbrl-fixture.ts
+++ b/scripts/dq/record-ixbrl-fixture.ts
@@ -2,7 +2,7 @@
 /**
  * Records a reproducible trimmed inline XBRL fixture from a real SEC primary document (plan 3 Task 13c).
  *
- *   npx tsx scripts/dq/record-ixbrl-fixture.ts --cik 320193 --accn 0000320193-23-000106 --out src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm
+ *   npx tsx scripts/dq/record-ixbrl-fixture.ts --cik 320193 --accn 0000320193-23-000106 --out src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm --raw-dir <dir>
  *
  * 1. GET https://data.sec.gov/submissions/CIK##########.json and find the accession in filings.recent
  *    (primaryDocument, isInlineXBRL, form, filingDate, reportDate) plus the top-level category and
@@ -12,17 +12,25 @@
  *    <out>.meta.json {source_url, source_sha256, source_bytes, fetched_at, trim_version, parser_version,
  *    trimmed_sha256, facts, contexts, units, submissions:{url, sha256, accession, form, filingDate,
  *    reportDate, primaryDocument, isInlineXBRL, category, fiscalYearEnd}}.
+ * 4. Before any fixture output, both downloaded originals (kinds sec-submissions / sec-document) are retained
+ *    through a RawStore; the fixture metadata records their paths and sha256 and the run fails if retention
+ *    fails. --raw-dir <dir> writes content-addressed files named exactly like RawStore paths (<kind>/<sha>.<ext>
+ *    plus .meta.json, never overwritten); without it the Supabase store is used when NEXT_PUBLIC_SUPABASE_URL
+ *    and SUPABASE_SERVICE_ROLE_KEY are set, otherwise the run refuses.
  * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. Nothing is
  * written unless both downloads and the trim succeed. Exit 1 on failure, 2 on bad arguments.
  */
 import {createHash} from 'node:crypto';
-import {writeFileSync} from 'node:fs';
+import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
+import {dirname,join} from 'node:path';
 import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
+import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
+import type {RawStore} from '../../src/lib/dq/raw-store';
 import {budgetFor,secPacer} from '../../src/lib/facts/providers/shared';
 import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
 import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from '../../src/lib/dq/reconcile/ixbrl-trim';
 
-const USAGE='usage: record-ixbrl-fixture.ts --cik <digits> --accn <##########-##-######> --out <path.htm>';
+const USAGE='usage: record-ixbrl-fixture.ts --cik <digits> --accn <##########-##-######> --out <path.htm> [--raw-dir <dir>]';
 const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
 
 async function get(url:string):Promise<Uint8Array>{
@@ -34,9 +42,35 @@ async function get(url:string):Promise<Uint8Array>{
  return bytes;
 }
 
+/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
+function dirRawStore(dir:string):RawStore{
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
+async function rawStoreFor(rawDir:string):Promise<RawStore>{
+ if(rawDir)return dirRawStore(rawDir);
+ if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
+  const {getAdminSupabase}=await import('../../src/lib/supabase/admin');
+  return supabaseRawStore(getAdminSupabase());
+ }
+ throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
+}
+
 async function main(){
- const argv=process.argv.slice(2);let cik='',accn='',out='';
- for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else{console.error(USAGE);process.exit(2);}}
+ const argv=process.argv.slice(2);let cik='',accn='',out='',rawDir='';
+ for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
  if(!/^[1-9]\d{0,9}$/.test(cik)||!/^\d{10}-\d{2}-\d{6}$/.test(accn)||!out.endsWith('.htm')){console.error(USAGE);process.exit(2);}
  const subUrl=`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
  const subBytes=await get(subUrl);
@@ -49,9 +83,13 @@ async function main(){
  if(!primaryDocument)throw new Error('no primaryDocument');
  const sourceUrl=`https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g,'')}/${primaryDocument}`;
  const source=await get(sourceUrl);
+ const store=await rawStoreFor(rawDir);
+ const rawSub=await store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,accession:accn}});
+ const rawDoc=await store.put({kind:'sec-document',bytes:source,contentType:'text/html',meta:{source_url:sourceUrl,accession:accn}});
  const trimmed=trimInlineXbrl(new TextDecoder('utf-8').decode(source),{keep:factConceptKeep,dropDimensional:true});
  const meta={source_url:sourceUrl,source_sha256:sha(source),source_bytes:source.byteLength,fetched_at:new Date().toISOString(),trim_version:IXBRL_TRIM_VERSION,parser_version:IXBRL_PARSER_VERSION,
   trimmed_sha256:sha(trimmed.html),facts:trimmed.facts,contexts:trimmed.contexts,units:trimmed.units,
+  raw:{document:{path:rawDoc.path,sha256:rawDoc.sha256,status:rawDoc.status},submissions:{path:rawSub.path,sha256:rawSub.sha256,status:rawSub.status}},
   submissions:{url:subUrl,sha256:sha(subBytes),accession:accn,form:at('form')??null,filingDate:at('filingDate')??null,reportDate:at('reportDate')??null,primaryDocument,isInlineXBRL:at('isInlineXBRL')===1||at('isInlineXBRL')===true,category:sub.category??null,fiscalYearEnd:sub.fiscalYearEnd??null}};
  writeFileSync(out,trimmed.html);
  writeFileSync(`${out}.meta.json`,`${JSON.stringify(meta,null,1)}\n`);
diff --git a/src/lib/dq/reconcile/ixbrl-trim.test.ts b/src/lib/dq/reconcile/ixbrl-trim.test.ts
index fb9253c..36d10f7 100644
--- a/src/lib/dq/reconcile/ixbrl-trim.test.ts
+++ b/src/lib/dq/reconcile/ixbrl-trim.test.ts
@@ -2,7 +2,7 @@
 import {readFileSync} from 'node:fs';
 import {describe,expect,it} from 'vitest';
 import {IxbrlParseError,parseInlineXbrl} from './ixbrl';
-import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';
+import {IXBRL_TRIM_VERSION,TrimError,equivalence,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';
 
 const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');
 
@@ -34,4 +34,61 @@ describe('trimInlineXbrl (reproducible fixture trimming)',()=>{
  it('refuses a document that is not inline XBRL',()=>{
   expect(()=>trimInlineXbrl('<html><body><p>x</p></body></html>',{keep:factConceptKeep})).toThrow(IxbrlParseError);
  });
+
+ describe('safety net and structure edge cases',()=>{
+  const ROOT='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217">';
+  const CTX=(id:string,extra='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>`;
+  const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
+  const ROOT_US=ROOT.replace('>',' xmlns:us-gaap="http://fasb.org/us-gaap/2023">');
+  const mk=(res:string,body:string)=>`<?xml version="1.0"?>\n${ROOT_US}<head/><body><div><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
+  const NF=(n:string,v:string,ctx='c1')=>`<ix:nonFraction name="${n}" contextRef="${ctx}" unitRef="usd" decimals="0">${v}</ix:nonFraction>`;
+  const keepAssets=(n:string)=>n==='us-gaap:Assets'||n==='us-gaap:Liabilities';
+  it('re-declares namespaces bound on an ancestor (body) for facts, contexts and QName measures',()=>{
+   const doc=`<?xml version="1.0"?>\n${ROOT}<head/><body xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:cur="http://www.xbrl.org/2003/iso4217"><ix:header><ix:resources>${CTX('c1')}<xbrli:unit id="usd"><xbrli:measure>cur:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${NF('us-gaap:Assets','5')}</body></html>`;
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   const p=parseInlineXbrl(t.html);
+   expect(p.facts.map(f=>[f.name,f.value,f.unit])).toEqual([['us-gaap:Assets','5','USD']]);
+   expect(t.html).toContain('xmlns:cur=');
+  });
+  it('refuses a selected tuple member instead of promoting it',()=>{
+   const doc=mk(CTX('c1')+USD,`<ix:tuple name="us-gaap:T" tupleID="t1">${NF('us-gaap:Assets','5')}</ix:tuple>`);
+   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(TrimError);
+   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(/trim_tuple_member/);
+  });
+  it('keeps duplicate context ids so the facts stay unsupported, as in the source',()=>{
+   const doc=mk(CTX('c1')+CTX('c1')+USD,NF('us-gaap:Assets','5'));
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(t.contexts).toBe(2);
+   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context_duplicate']);
+  });
+  it('keeps duplicate unit ids',()=>{
+   const doc=mk(CTX('c1')+USD+USD,NF('us-gaap:Assets','5'));
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(t.units).toBe(2);
+   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['unit']);
+  });
+  it('keeps a selected fact nested inside an unselected one and the contexts of every fact in a kept slice',()=>{
+   const inner=NF('us-gaap:Liabilities','7','c2');
+   const doc=mk(CTX('c1')+CTX('c2')+CTX('c3')+USD,`<ix:nonNumeric name="us-gaap:Other" contextRef="c3">x ${inner}</ix:nonNumeric>`);
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(t).toMatchObject({facts:1,contexts:1});
+   expect(parseInlineXbrl(t.html).facts.map(f=>f.name)).toEqual(['us-gaap:Liabilities']);
+   // selected outer with an unselected nested fact: the nested fact's context travels with the slice
+   const doc2=mk(CTX('c1')+CTX('c2')+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
+   expect(trimInlineXbrl(doc2,{keep:keepAssets})).toMatchObject({facts:1,contexts:2});
+  });
+  it('keeps a selected fact with a missing context (unsupported is preserved, not lost)',()=>{
+   const doc=mk(USD,NF('us-gaap:Assets','5','missing'));
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context']);
+  });
+  it('the equivalence check names every differing fact, dei text and unsupported entry',()=>{
+   const a=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','5')+NF('us-gaap:Liabilities','6','nope')));
+   const b=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','9')));
+   const d=equivalence(a,b,keepAssets);
+   expect(d.length).toBe(3);   // Assets 5 vs 9 (two entries) and the Liabilities unsupported entry
+   expect(equivalence(a,a,keepAssets)).toEqual([]);
+   expect(()=>{throw new TrimError('trim_not_equivalent',d);}).toThrow(/trim_not_equivalent/);
+  });
+ });
 });
diff --git a/src/lib/dq/reconcile/ixbrl-trim.ts b/src/lib/dq/reconcile/ixbrl-trim.ts
index 76be474..a733c8a 100644
--- a/src/lib/dq/reconcile/ixbrl-trim.ts
+++ b/src/lib/dq/reconcile/ixbrl-trim.ts
@@ -1,16 +1,21 @@
 // src/lib/dq/reconcile/ixbrl-trim.ts
 // Deterministic trimming of a real inline XBRL primary document into a small committed fixture
 // (IXBRL_TRIM_VERSION='ixbrl-trim/1'; plan 3 Task 13c). Kept, as verbatim source slices: the root
-// element's open tag (every xmlns declaration), each OUTERMOST ix:nonFraction / ix:nonNumeric whose
-// resolved concept name passes `keep` (default factConceptKeep: every FACT_CONCEPTS tag plus the three dei
-// nonNumeric names), and the xbrli:context / xbrli:unit elements those facts reference. Facts in
-// dimensional contexts are dropped unless dropDimensional:false. Output order is source order, one fact
-// per <p>, so identical source bytes always give identical trimmed bytes. Uses the same tokenizer and
-// namespace resolution as ixbrl.ts, so prefixes do not matter.
+// element's open tag (every xmlns declaration), each selected ix:nonFraction / ix:nonNumeric (every
+// nesting level; a selected fact inside an unselected one is kept on its own), and the xbrli:context /
+// xbrli:unit elements that every fact inside a kept slice references. Each slice is emitted with the
+// in-scope xmlns bindings it had in the source (from all ancestors), so prefixes inside it (concept
+// names, QName-valued measures) still resolve. Facts in dimensional contexts are dropped unless
+// dropDimensional:false. Duplicate context / unit ids are all kept (the document stays unsupported
+// exactly as the source was); a selected fact inside ix:tuple (or with tupleRef) makes the trim refuse
+// (trim_tuple_member). Safety net: the original and the trimmed document are both parsed with
+// parseInlineXbrl and, for every selected concept, facts (key, value, decimals), dei texts and
+// unsupported entries must be identical, otherwise trim_not_equivalent. Output order is source order,
+// one fact per <p>, so identical source bytes always give identical trimmed bytes.
 import {FACT_CONCEPTS} from '../../facts/concepts';
 import {tagsOf} from '../../facts/providers/edgar-companyfacts';
-import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,resolveQName,tokenizeXml} from './ixbrl';
-import type {NsMap} from './ixbrl';
+import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,ixFactKey,parseInlineXbrl,resolveQName,tokenizeXml} from './ixbrl';
+import type {IxbrlDocument,NsMap} from './ixbrl';
 
 export const IXBRL_TRIM_VERSION='ixbrl-trim/1';
 const KEEP=new Set<string>([...FACT_CONCEPTS.flatMap(c=>tagsOf(c)),...DEI_NON_NUMERIC]);
@@ -18,25 +23,53 @@ export const factConceptKeep=(name:string):boolean=>KEEP.has(name);
 export interface TrimOptions{keep:(name:string)=>boolean;dropDimensional?:boolean}
 export interface TrimResult{html:string;facts:number;contexts:number;units:number}
 
+/** code is 'trim_not_equivalent' | 'trim_tuple_member' (plus the parser's own codes); detail names differing keys. */
+export class TrimError extends IxbrlParseError{constructor(code:string,public readonly detail:string[]=[]){super(detail.length>0?`${code}: ${detail.join('; ')}`:code);this.name='TrimError';}}
+
 interface El{name:string;ns:NsMap;uri:string|null;local:string}
-interface Span{start:number;end:number}
-interface FactSpan extends Span{name:string;contextRef:string;unitRef:string|null}
+interface Span{start:number;end:number;openEnd:number;parentNs:NsMap;own:Set<string>}
+interface CtxSpan extends Span{dimensional:boolean}
+interface FactSpan extends Span{kind:'nf'|'nn';name:string;contextRef:string;unitRef:string|null;tuple:boolean}
 const attrOf=(a:readonly [string,string][],k:string)=>a.find(([n])=>n===k)?.[1];
 const isFact=(el:{uri:string|null;local:string})=>el.uri===NS.ix&&(el.local==='nonFraction'||el.local==='nonNumeric');
+const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
+const declOf=(attrs:readonly [string,string][])=>new Set(attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:')).map(([k])=>k==='xmlns'?'':k.slice(6)));
+/** xmlns attributes for the bindings in `ns` that differ from `base` (and are not redeclared in `skip`). */
+function declsFor(ns:NsMap,base:NsMap,skip?:ReadonlySet<string>):string{
+ let s='';
+ for(const [p,u] of ns){
+  if(p==='xml'||base.get(p)===u||skip?.has(p))continue;
+  s+=p===''?` xmlns="${esc(u)}"`:` xmlns:${p}="${esc(u)}"`;
+ }
+ return s;
+}
+/** Source slice with extra xmlns attributes inserted into its own open tag. */
+function sliceWith(doc:string,s:Span,base:NsMap):string{
+ const add=declsFor(s.parentNs,base,s.own);
+ if(add==='')return doc.slice(s.start,s.end);
+ const open=doc.slice(s.start,s.openEnd);
+ const cut=open.endsWith('/>')?open.length-2:open.length-1;
+ return open.slice(0,cut)+add+open.slice(cut)+doc.slice(s.openEnd,s.end);
+}
 
 export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
  const dropDimensional=opts.dropDimensional??true;
  const root:NsMap=new Map([['xml',NS.xml]]);const stack:El[]=[];
- let rootOpen:string|null=null,rootName='',headerName:string|null=null,resourcesName:string|null=null;
- const contexts=new Map<string,Span&{dimensional:boolean}>();const units=new Map<string,Span>();const facts:FactSpan[]=[];
- let ctx:{id:string;start:number;dimensional:boolean;segDepth:number}|null=null;
- let unit:{id:string;start:number}|null=null;
- let fact:{depth:number;start:number;name:string;contextRef:string;unitRef:string|null}|null=null;
+ let rootOpen:string|null=null,rootName='',rootNs:NsMap=root;
+ let header:{name:string;ns:NsMap}|null=null,resources:{name:string;ns:NsMap}|null=null;
+ const contexts=new Map<string,CtxSpan[]>();const units=new Map<string,Span[]>();const facts:FactSpan[]=[];
+ let ctx:(CtxSpan&{id:string;segDepth:number})|null=null;
+ let unit:(Span&{id:string})|null=null;
+ const open:(Omit<FactSpan,'end'>&{depth:number})[]=[];
+ let tuples=0;
+ const push=<T>(m:Map<string,T[]>,k:string,v:T)=>{const a=m.get(k);if(a)a.push(v);else m.set(k,[v]);};
  const close=(el:El,end:number)=>{
-  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){contexts.set(ctx.id,{start:ctx.start,end,dimensional:ctx.dimensional});ctx=null;return;}
+  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){push(contexts,ctx.id,{start:ctx.start,end,openEnd:ctx.openEnd,parentNs:ctx.parentNs,own:ctx.own,dimensional:ctx.dimensional});ctx=null;return;}
   if(ctx!==null&&el.uri===NS.xbrli&&(el.local==='segment'||el.local==='scenario')&&ctx.segDepth===stack.length){ctx.segDepth=-1;return;}
-  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){units.set(unit.id,{start:unit.start,end});unit=null;return;}
-  if(fact!==null&&stack.length===fact.depth&&isFact(el)){facts.push({...fact,end});fact=null;}
+  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){push(units,unit.id,{start:unit.start,end,openEnd:unit.openEnd,parentNs:unit.parentNs,own:unit.own});unit=null;return;}
+  const top=open[open.length-1];
+  if(top&&stack.length===top.depth&&isFact(el)){open.pop();const {depth:_d,...f}=top;void _d;facts.push({...f,end});}
+  if(el.uri===NS.ix&&el.local==='tuple')tuples=Math.max(0,tuples-1);
  };
  for(const tok of tokenizeXml(doc)){
   if(tok.t==='text')continue;
@@ -45,33 +78,72 @@ export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
    if(!el||el.name!==tok.name)throw new IxbrlParseError('mismatched_close');
    close(el,tok.end);continue;
   }
-  const parent=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parent;
+  const parentNs=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parentNs;
   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
-  if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
+  if(decl.length>0){const m=new Map(parentNs);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   const {uri,local}=resolveQName(tok.name,ns,true);
   const el:El={name:tok.name,ns,uri,local};
-  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;}
+  const span={start:tok.start,openEnd:tok.end,parentNs,own:declOf(tok.attrs)};
+  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;rootNs=ns;}
   if(ctx!==null&&ctx.segDepth>=0)ctx.dimensional=true;
-  else if(uri===NS.ix&&local==='header'&&headerName===null)headerName=tok.name;
-  else if(uri===NS.ix&&local==='resources'&&resourcesName===null)resourcesName=tok.name;
-  else if(uri===NS.xbrli&&local==='context')ctx={id:attrOf(tok.attrs,'id')??'',start:tok.start,dimensional:false,segDepth:-1};
+  else if(uri===NS.ix&&local==='header'&&header===null)header={name:tok.name,ns};
+  else if(uri===NS.ix&&local==='resources'&&resources===null)resources={name:tok.name,ns};
+  else if(uri===NS.xbrli&&local==='context'&&ctx===null)ctx={...span,end:0,id:attrOf(tok.attrs,'id')??'',dimensional:false,segDepth:-1};
   else if(ctx!==null&&uri===NS.xbrli&&(local==='segment'||local==='scenario'))ctx.segDepth=stack.length;
-  else if(uri===NS.xbrli&&local==='unit')unit={id:attrOf(tok.attrs,'id')??'',start:tok.start};
-  else if(fact===null&&isFact(el)){
+  else if(uri===NS.xbrli&&local==='unit'&&unit===null)unit={...span,end:0,id:attrOf(tok.attrs,'id')??''};
+  else if(isFact(el)){
    const q=resolveQName((attrOf(tok.attrs,'name')??'').trim(),ns,true);
-   fact={depth:stack.length,start:tok.start,name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null};
+   open.push({...span,depth:stack.length,kind:local==='nonFraction'?'nf':'nn',name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',
+    unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null,tuple:tuples>0||attrOf(tok.attrs,'tupleRef')!==undefined});
   }
+  if(uri===NS.ix&&local==='tuple'&&!tok.self)tuples++;
   if(tok.self)close(el,tok.end);else stack.push(el);
  }
  if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
- if(rootOpen===null||headerName===null||resourcesName===null)throw new IxbrlParseError('not_inline_xbrl');
- const kept=facts.filter(f=>{const c=contexts.get(f.contextRef);return opts.keep(f.name)&&c!==undefined&&!(dropDimensional&&c.dimensional);});
+ if(rootOpen===null||header===null||resources===null)throw new IxbrlParseError('not_inline_xbrl');
+
+ facts.sort((a,b)=>a.start-b.start);
+ const dropped=(f:FactSpan)=>{
+  if(f.kind==='nn'||!dropDimensional)return false;
+  const cs=contexts.get(f.contextRef);
+  return cs!==undefined&&cs.length===1&&cs[0].dimensional;   // duplicates stay: the parser reports them whatever their content
+ };
+ const kept=facts.filter(f=>opts.keep(f.name)&&!dropped(f));
+ if(kept.some(f=>f.tuple))throw new TrimError('trim_tuple_member',kept.filter(f=>f.tuple).map(f=>f.name));
+ // emitted slices: kept facts not already inside an earlier emitted slice
+ const emitted:FactSpan[]=[];let lastEnd=-1;
+ for(const f of kept)if(f.start>=lastEnd){emitted.push(f);lastEnd=f.end;}
+ const inside=facts.filter(f=>emitted.some(e=>f.start>=e.start&&f.end<=e.end));
+ const ctxIds=new Set<string>(),unitIds=new Set<string>();
+ for(const f of inside){
+  if(!dropped(f)&&f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);
+  if(f.unitRef!==null&&f.unitRef!==''&&units.has(f.unitRef))unitIds.add(f.unitRef);
+ }
  const bySource=(a:Span,b:Span)=>a.start-b.start;
- const keptContexts=[...new Set(kept.map(f=>f.contextRef))].map(id=>contexts.get(id)!).sort(bySource);
- const keptUnits=[...new Set(kept.map(f=>f.unitRef).filter((u):u is string=>u!==null&&units.has(u)))].map(id=>units.get(id)!).sort(bySource);
- const slice=(s:Span)=>doc.slice(s.start,s.end);
+ const keptContexts=[...ctxIds].flatMap(id=>contexts.get(id)!).sort(bySource);
+ const keptUnits=[...unitIds].flatMap(id=>units.get(id)!).sort(bySource);
+ const wrap=(s:Span)=>sliceWith(doc,s,rootNs);
  const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
-  `<div style="display:none"><${headerName}><${resourcesName}>`,...keptContexts.map(slice),...keptUnits.map(slice),`</${resourcesName}></${headerName}></div>`,
-  ...kept.map(f=>`<p>${slice(f)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
+  `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
+  ...emitted.map(f=>`<p${declsFor(f.parentNs,rootNs)}>${doc.slice(f.start,f.end)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
+
+ // safety net
+ const diff=equivalence(parseInlineXbrl(doc),parseInlineXbrl(html),opts.keep);
+ if(diff.length>0)throw new TrimError('trim_not_equivalent',diff.slice(0,10));
  return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
 }
+
+/** Keys that differ between the original and trimmed parses, restricted to the selected concepts. */
+export function equivalence(a:IxbrlDocument,b:IxbrlDocument,keep:(n:string)=>boolean):string[]{
+ const facts=(d:IxbrlDocument)=>d.facts.filter(f=>keep(f.name)).map(f=>`fact ${ixFactKey(f)}=${f.value}@${f.decimals??''}`);
+ const nn=(d:IxbrlDocument)=>Object.entries(d.nonNumeric).filter(([k])=>keep(k)).map(([k,v])=>`nonNumeric ${k}=${v}`);
+ const uns=(d:IxbrlDocument)=>d.unsupported.filter(u=>u.name!==undefined&&keep(u.name)).map(u=>`unsupported ${JSON.stringify([u.reason,u.name,u.contextRef??'',u.periodStart??'',u.periodEnd??''])}`);
+ const out:string[]=[];
+ for(const pick of [facts,nn,uns]){
+  const x=pick(a).sort(),y=pick(b).sort();
+  const cnt=(l:string[])=>{const m=new Map<string,number>();for(const k of l)m.set(k,(m.get(k)??0)+1);return m;};
+  const cx=cnt(x),cy=cnt(y);
+  for(const k of new Set([...cx.keys(),...cy.keys()]))if(cx.get(k)!==cy.get(k))out.push(`${k} (original ${cx.get(k)??0}, trimmed ${cy.get(k)??0})`);
+ }
+ return out;
+}

exec
/bin/zsh -lc 'find . -name AGENTS.md -o -name AGENTS.override.md -o -name CLAUDE.md; cat src/lib/dq/raw-store.ts; cat src/lib/dq/reconcile/ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 334ms:
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
 });
}

/** Streaming tokens with source offsets [start, end). Throws IxbrlParseError on malformed markup. */
export function* tokenizeXml(doc:string):Generator<XmlToken>{
 const n=doc.length;let i=doc.charCodeAt(0)===0xfeff?1:0;let depth=0;let rawEnd:string|null=null;
 while(i<n){
  if(rawEnd!==null){
   // end tag: '</' + the element name (case-insensitive) + whitespace or '>'; no whole-document lowercasing (length-changing case folds)
   let e=-1;
   for(let k=doc.indexOf('</',i);k>=0;k=doc.indexOf('</',k+2)){
    const nm=doc.slice(k+2,k+2+rawEnd.length);
    const nx=doc.charCodeAt(k+2+rawEnd.length);
    if(nm.toLowerCase()===rawEnd&&(nx===62||isWs(nx))){e=k;break;}
   }
   if(e<0)fail('unterminated_raw_text');
   if(e>i)yield {t:'text',text:doc.slice(i,e),start:i,end:e};
   rawEnd=null;i=e;continue;
  }
  const lt=doc.indexOf('<',i);
  if(lt<0){yield {t:'text',text:decodeEntities(doc.slice(i)),start:i,end:n};break;}
  if(lt>i)yield {t:'text',text:decodeEntities(doc.slice(i,lt)),start:i,end:lt};
  if(doc.startsWith('<!--',lt)){const e=doc.indexOf('-->',lt+4);if(e<0)fail('unterminated_comment');i=e+3;continue;}
  if(doc.startsWith('<![CDATA[',lt)){const e=doc.indexOf(']]>',lt+9);if(e<0)fail('unterminated_cdata');yield {t:'text',text:doc.slice(lt+9,e),start:lt,end:e+3};i=e+3;continue;}
  if(doc.startsWith('<?',lt)){const e=doc.indexOf('?>',lt+2);if(e<0)fail('unterminated_pi');i=e+2;continue;}
  if(doc.startsWith('<!',lt)){const e=doc.indexOf('>',lt+2);if(e<0)fail('unterminated_declaration');if(doc.slice(lt,e).includes('['))fail('dtd_unsupported');i=e+1;continue;}
  if(doc.charCodeAt(lt+1)===47){
   const name=nameAt(doc,lt+2)??fail('bad_close_tag');
   let j=lt+2+name.length;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='>')fail('bad_close_tag');
   depth--;if(depth<0)fail('unbalanced_close');
   yield {t:'close',name,start:lt,end:j+1};i=j+1;continue;
  }
  const name=nameAt(doc,lt+1)??fail('bad_open_tag');
  let j=lt+1+name.length;const attrs:[string,string][]=[];let self=false;
  for(;;){
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(j>=n)fail('unterminated_tag');
   if(doc.startsWith('/>',j)){self=true;j+=2;break;}
   if(doc[j]==='>'){j++;break;}
   const an=nameAt(doc,j)??fail('bad_attribute');j+=an.length;
   if(attrs.some(([k])=>k===an))fail('bad_attribute');   // duplicate attribute
   while(j<n&&isWs(doc.charCodeAt(j)))j++;
   if(doc[j]!=='=')fail('bad_attribute');
   j++;while(j<n&&isWs(doc.charCodeAt(j)))j++;
   const q=doc[j];if(q!=='"'&&q!=="'")fail('bad_attribute');
   const e=doc.indexOf(q,j+1);if(e<0)fail('unterminated_attribute');
   attrs.push([an,decodeEntities(doc.slice(j+1,e))]);j=e+1;
   if(j<n&&!isWs(doc.charCodeAt(j))&&doc[j]!=='>'&&doc[j]!=='/')fail('bad_attribute');   // attributes need separating whitespace
   if(attrs.length>MAX_ATTRS)fail('too_many_attributes');
  }
  yield {t:'open',name,attrs,self,start:lt,end:j};
  if(!self){
   depth++;if(depth>MAX_DEPTH)fail('too_deep');
   const local=name.slice(name.indexOf(':')+1).toLowerCase();
   if(local==='script'||local==='style')rawEnd=name.toLowerCase();
  }
  i=j;
 }
 if(rawEnd!==null)fail('unterminated_raw_text');
}

// ---------------- names ----------------
export type NsMap=ReadonlyMap<string,string>;   // prefix ('' = default namespace) → URI
/** Element names and QName values use the default namespace when unprefixed (useDefault); plain attribute names never do. */
export function resolveQName(q:string,ns:NsMap,useDefault:boolean):{uri:string|null;local:string}{
 const k=q.indexOf(':');
 if(k<0)return {uri:useDefault?(ns.get('')??null):null,local:q};
 const p=q.slice(0,k);
 return {uri:p==='xml'?NS.xml:(ns.get(p)??null),local:q.slice(k+1)};
}
/** Canonical concept name: us-gaap / dei / ifrs-full / srt by namespace URI pattern (any taxonomy year), else Clark notation {uri}local. */
export function canonicalConcept(uri:string|null,local:string):string{
 if(uri!==null){
  if(/^http:\/\/fasb\.org\/us-gaap\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `us-gaap:${local}`;
  if(/^http:\/\/xbrl\.sec\.gov\/dei\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `dei:${local}`;
  if(/^https?:\/\/xbrl\.ifrs\.org\/taxonomy\/\d{4}-\d{2}-\d{2}\/ifrs-full$/.test(uri))return `ifrs-full:${local}`;
  if(/^http:\/\/fasb\.org\/srt\/\d{4}(-\d{2}-\d{2})?$/.test(uri))return `srt:${local}`;
 }
 return `{${uri??''}}${local}`;
}
const attrOf=(attrs:readonly [string,string][],name:string)=>attrs.find(([k])=>k===name)?.[1];
function nsAttr(attrs:readonly [string,string][],ns:NsMap,uri:string,local:string):string|undefined{
 for(const [k,v] of attrs){
  const i=k.indexOf(':');if(i<0)continue;
  const p=k.slice(0,i);if(p==='xmlns')continue;
  if(ns.get(p)===uri&&k.slice(i+1)===local)return v;
 }
 return undefined;
}

// ---------------- values ----------------
const RE_DOT=/^\s*-?[0-9][0-9,]*(\.[0-9]+)?\s*$/;
const RE_COMMA=/^\s*-?[0-9][0-9.]*(,[0-9]+)?\s*$/;
/** Digits (no exponent) for a format's text, or null when the text does not match the format's grammar. */
export function parseFactText(format:string,text:string):string|null{
 switch(format){
  case 'none':case 'num-dot-decimal':case 'numdotdecimal':return RE_DOT.test(text)?text.replace(/[\s,]/g,''):null;
  case 'num-comma-decimal':case 'numcommadecimal':return RE_COMMA.test(text)?text.replace(/[\s.]/g,'').replace(',','.'):null;
  case 'fixed-zero':case 'zerodash':return '0';
  case 'numwordsen':{const t=text.trim().toLowerCase();return t==='no'||t==='none'?'0':null;}
  default:return null;
 }
}
function formatOf(q:string|undefined,ns:NsMap):string|null{
 if(q===undefined)return 'none';
 const r=resolveQName(q.trim(),ns,true);
 return r.uri!==null&&TRANSFORM_NS.includes(r.uri)?r.local:null;
}
/** Right-side key of a fact: (concept, canonical context = entity + period, unit). */
export const ixFactKey=(f:Pick<IxFact,'name'|'entity'|'periodStart'|'periodEnd'|'unit'>)=>[f.name,f.entity,f.periodStart??'',f.periodEnd,f.unit].join('|');
/** Facts grouped by ixFactKey with their DISTINCT values (canonical decimal equality), in document order. */
export function indexIxFacts(facts:readonly IxFact[]):Map<string,{values:string[];facts:IxFact[]}>{
 const out=new Map<string,{values:string[];facts:IxFact[]}>();
 for(const f of facts){
  const k=ixFactKey(f);const g=out.get(k)??{values:[],facts:[]};
  if(!g.values.includes(f.value))g.values.push(f.value);
  g.facts.push(f);out.set(k,g);
 }
 return out;
}

// ---------------- parser ----------------
interface Frame{name:string;ns:NsMap;uri:string|null;local:string}
interface RawCtx{id:string;scheme:string;ident:string;start:string;end:string;instant:string;forever:boolean;dimensional:boolean}
interface RawUnit{id:string;measures:string[];num:string[];den:string[];bad:boolean}
interface FactFrame{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;inner:string|null;tuple:boolean}
interface RawFact{kind:'nf'|'nn';attrs:[string,string][];ns:NsMap;text:string;tuple:boolean}
/**
 * Mutable parser state, one explicitly typed object (plan audit P7): the open/close callbacks and the token
 * loop all read and write it through `st.*`. Closure `let`s assigned inside callbacks are invisible to the
 * loop's control-flow analysis (TS narrows them to their initial null/false → `never`, TS2322/TS2339 under
 * strict 5.9); property reads of a typed object are narrowed per use instead.
 */
interface ParseState{
 sawIx:boolean;exclude:number;tuple:number;
 ctx:RawCtx|null;ctxField:'ident'|'start'|'end'|'instant'|null;segDepth:number;
 unit:RawUnit|null;unitPart:'num'|'den'|null;measure:{ns:NsMap;text:string}|null;
}
const DATE=/^\d{4}-\d{2}-\d{2}$/;

function periodOf(c:RawCtx):{start:string|null;end:string}|null{
 if(c.forever)return null;
 const s=c.start.trim(),e=c.end.trim(),i=c.instant.trim();
 if(i!==''&&s===''&&e==='')return DATE.test(i)?{start:null,end:i}:null;
 if(i===''&&DATE.test(s)&&DATE.test(e)&&s<=e)return {start:s,end:e};
 return null;
}
function unitString(u:RawUnit):string|null{
 if(u.bad)return null;
 if(u.num.length>0||u.den.length>0)return u.num.length===1&&u.den.length===1&&u.measures.length===0?`${u.num[0]}/${u.den[0]}`:null;
 return u.measures.length===1?u.measures[0]:null;
}

export function parseInlineXbrl(doc:string):IxbrlDocument{
 const out:IxbrlDocument={facts:[],nonNumeric:{},unsupported:[]};
 const root:NsMap=new Map([['xml',NS.xml]]);
 const stack:Frame[]=[];
 const contexts=new Map<string,RawCtx>();const units=new Map<string,RawUnit>();const rawFacts:RawFact[]=[];
 const open:FactFrame[]=[];
 const dupCtx=new Set<string>(),dupUnits=new Set<string>(),conflicted=new Set<string>();
 const st:ParseState={sawIx:false,exclude:0,tuple:0,ctx:null,ctxField:null,segDepth:-1,unit:null,unitPart:null,measure:null};

 const onOpen=(f:Frame,attrs:[string,string][])=>{
  if(st.ctx!==null&&st.segDepth>=0){st.ctx.dimensional=true;return;}   // any element inside segment / scenario
  if(f.uri===NS.ix){
   st.sawIx=true;
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const member=attrOf(attrs,'tupleRef')!==undefined||st.tuple>0;   // directly or transitively inside ix:tuple
    if(member)out.unsupported.push({reason:'tuple_member',name:attrOf(attrs,'name')});
    open.push({kind:f.local==='nonFraction'?'nf':'nn',attrs,ns:f.ns,text:'',inner:null,tuple:member});
   }else if(f.local==='exclude')st.exclude++;
   else if(f.local==='fraction'||f.local==='tuple'){
    if(f.local==='tuple')st.tuple++;
    out.unsupported.push({reason:`ix_${f.local}`,name:attrOf(attrs,'name')});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(f.local==='context'){st.ctx={id:attrOf(attrs,'id')??'',scheme:'',ident:'',start:'',end:'',instant:'',forever:false,dimensional:false};return;}
  if(st.ctx!==null){
   if(f.local==='segment'||f.local==='scenario'){st.segDepth=stack.length;return;}
   if(f.local==='identifier'){st.ctx.scheme=(attrOf(attrs,'scheme')??'').trim();st.ctxField='ident';return;}
   if(f.local==='startDate'){st.ctxField='start';return;}
   if(f.local==='endDate'){st.ctxField='end';return;}
   if(f.local==='instant'){st.ctxField='instant';return;}
   if(f.local==='forever'){st.ctx.forever=true;return;}
   return;
  }
  if(f.local==='unit'){st.unit={id:attrOf(attrs,'id')??'',measures:[],num:[],den:[],bad:false};return;}
  if(st.unit!==null){
   if(f.local==='unitNumerator')st.unitPart='num';
   else if(f.local==='unitDenominator')st.unitPart='den';
   else if(f.local==='measure')st.measure={ns:f.ns,text:''};
  }
 };
 const onClose=(f:Frame)=>{
  if(f.uri===NS.ix){
   if(f.local==='exclude'){st.exclude=Math.max(0,st.exclude-1);return;}
   if(f.local==='tuple'){st.tuple=Math.max(0,st.tuple-1);return;}
   if(f.local==='nonFraction'||f.local==='nonNumeric'){
    const fr=open.pop();if(!fr)return;
    const text=fr.inner??fr.text;
    const parent=open[open.length-1];
    if(parent){if(parent.kind==='nf')parent.inner=text;else parent.text+=text;}
    rawFacts.push({kind:fr.kind,attrs:fr.attrs,ns:fr.ns,text,tuple:fr.tuple});
   }
   return;
  }
  if(f.uri!==NS.xbrli)return;
  if(st.ctx!==null){
   if(f.local==='context'){if(contexts.has(st.ctx.id))dupCtx.add(st.ctx.id);contexts.set(st.ctx.id,st.ctx);st.ctx=null;st.ctxField=null;st.segDepth=-1;return;}
   if((f.local==='segment'||f.local==='scenario')&&st.segDepth===stack.length){st.segDepth=-1;return;}
   if(f.local==='identifier'||f.local==='startDate'||f.local==='endDate'||f.local==='instant')st.ctxField=null;
   return;
  }
  if(st.unit!==null){
   if(f.local==='unit'){if(units.has(st.unit.id))dupUnits.add(st.unit.id);units.set(st.unit.id,st.unit);st.unit=null;st.unitPart=null;return;}
   if(f.local==='measure'&&st.measure!==null){
    const r=resolveQName(st.measure.text.trim(),st.measure.ns,true);
    // namespace and local name are validated together: iso4217 → ISO currency code, xbrli → shares | pure
    const okMeasure=(r.uri===NS.iso4217&&/^[A-Z]{3}$/.test(r.local))||(r.uri===NS.xbrli&&(r.local==='shares'||r.local==='pure'));
    if(!okMeasure)st.unit.bad=true;
    const m=okMeasure?r.local:`{${r.uri??''}}${r.local}`;
    (st.unitPart==='num'?st.unit.num:st.unitPart==='den'?st.unit.den:st.unit.measures).push(m);st.measure=null;return;
   }
   if(f.local==='unitNumerator'||f.local==='unitDenominator')st.unitPart=null;
  }
 };

 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text'){
   if(st.ctx!==null&&st.ctxField!==null&&st.segDepth<0)st.ctx[st.ctxField]+=tok.text;
   if(st.measure!==null)st.measure.text+=tok.text;
   if(open.length>0&&st.exclude===0)open[open.length-1].text+=tok.text;
   continue;
  }
  if(tok.t==='open'){
   const parent=stack.length>0?stack[stack.length-1].ns:root;
   let ns:NsMap=parent;
   const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
   if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
   const {uri,local}=resolveQName(tok.name,ns,true);
   const frame:Frame={name:tok.name,ns,uri,local};
   if(tok.self){onOpen(frame,tok.attrs);onClose(frame);}
   else{onOpen(frame,tok.attrs);stack.push(frame);}
   continue;
  }
  const frame=stack.pop();
  if(!frame||frame.name!==tok.name)throw new IxbrlParseError('mismatched_close');
  onClose(frame);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(!st.sawIx)return {facts:[],nonNumeric:{},unsupported:[{reason:'not_inline_xbrl'}]};

 for(const f of rawFacts){
  const nameQ=attrOf(f.attrs,'name');
  if(!nameQ){out.unsupported.push({reason:'name'});continue;}
  const q=resolveQName(nameQ.trim(),f.ns,true);const name=canonicalConcept(q.uri,q.local);
  if(f.kind==='nn'){
   if(!DEI_NON_NUMERIC.includes(name)||f.tuple)continue;
   if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
   if(conflicted.has(name))continue;   // once conflicting, unavailable for good
   const text=f.text.replace(/\s+/g,' ').trim();
   const prev=out.nonNumeric[name];
   if(prev===undefined)out.nonNumeric[name]=text;
   else if(prev!==text){delete out.nonNumeric[name];conflicted.add(name);out.unsupported.push({reason:'nonnumeric_conflict',name});}
   continue;
  }
  if(f.tuple)continue;   // reported when opened
  if(attrOf(f.attrs,'continuedAt')!==undefined){out.unsupported.push({reason:'continuation',name});continue;}
  const contextRef=attrOf(f.attrs,'contextRef')??'';
  const c=contextRef===''?undefined:contexts.get(contextRef);
  if(!c){out.unsupported.push({reason:'context',name,contextRef});continue;}
  if(dupCtx.has(contextRef)){out.unsupported.push({reason:'context_duplicate',name,contextRef});continue;}
  if(c.dimensional)continue;
  if(c.ident.trim()===''||c.scheme.trim()===''){out.unsupported.push({reason:'entity',name,contextRef});continue;}
  const period=periodOf(c);
  if(!period){out.unsupported.push({reason:'period',name,contextRef});continue;}
  const where={name,contextRef,periodStart:period.start,periodEnd:period.end};
  const nil=nsAttr(f.attrs,f.ns,NS.xsi,'nil');
  if(nil==='true'||nil==='1'){out.unsupported.push({reason:'nil',...where});continue;}
  const unitRef=attrOf(f.attrs,'unitRef')??'';
  const u=unitRef===''||dupUnits.has(unitRef)?undefined:units.get(unitRef);const raw=u?unitString(u):null;const unitNorm=raw===null?null:normalizeUnit(raw);
  if(unitNorm===null){out.unsupported.push({reason:'unit',...where});continue;}
  const scaleRaw=(attrOf(f.attrs,'scale')??'0').trim();
  if(!/^-?\d{1,2}$/.test(scaleRaw)){out.unsupported.push({reason:'scale',...where});continue;}
  const decimalsRaw=attrOf(f.attrs,'decimals')?.trim();
  if(decimalsRaw!==undefined&&!/^(INF|[+-]?\d+)$/.test(decimalsRaw)){out.unsupported.push({reason:'decimals',...where});continue;}
  const sign=attrOf(f.attrs,'sign');
  if(sign!==undefined&&sign!=='-'){out.unsupported.push({reason:'sign',...where});continue;}
  const fmt=formatOf(attrOf(f.attrs,'format'),f.ns);
  const digits=fmt===null?null:parseFactText(fmt,f.text);
  if(digits===null){out.unsupported.push({reason:'format',...where});continue;}
  if(digits.startsWith('-')){out.unsupported.push({reason:'sign',...where});continue;}   // the sign belongs in the sign attribute
  const scale=Number(scaleRaw);
  let value:string;
  try{value=canonicalDecimal(`${digits}e${scale}`);}catch{out.unsupported.push({reason:'decimal_bounds',...where});continue;}
  if(sign==='-'&&value!=='0')value=value.startsWith('-')?value.slice(1):`-${value}`;
  out.facts.push({name,periodStart:period.start,periodEnd:period.end,unit:unitNorm,value,decimals:decimalsRaw===undefined?null:decimalsRaw.replace(/^\+/,''),scale,entity:`${c.scheme}#${c.ident.trim()}`,contextRef,unitRef});
 }
 return out;
}

exec
/bin/zsh -lc "node - <<'JS'
const ts=require('typescript'),fs=require('fs');require.extensions['.ts']=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);
const {trimInlineXbrl}=require('./src/lib/dq/reconcile/ixbrl-trim.ts');
const ctx=(id,extra='')=>"'`<x:context id="${id}"><x:entity><x:identifier scheme="cik">1</x:identifier>${extra}</x:entity><x:period><x:instant>2023-09-30</x:instant></x:period></x:context>`;
const unit='"'<x:unit id=\"u\"><x:measure>iso:USD</x:measure></x:unit>';
const fact=(c,v)=>"'`<ix:nonFraction name="us-gaap:Assets" contextRef="${c}" unitRef="u">${v}</ix:nonFraction>`;
const root='"'<html xmlns:ix=\"http://www.xbrl.org/2013/inlineXBRL\" xmlns:x=\"http://www.xbrl.org/2003/instance\" xmlns:iso=\"http://www.xbrl.org/2003/iso4217\" xmlns:us-gaap=\"http://fasb.org/us-gaap/2023\">';
const docs=[root+'<body><ix:header><ix:resources>'+ctx('a')+ctx('b','<x:segment><dim/></x:segment>')+unit+'</ix:resources></ix:header>'+fact('a',fact('b','5'))+'</body></html>', root+'<body><ix:header><ix:resources xmlns:iso=\"urn:other\"><div xmlns:iso=\"http://www.xbrl.org/2003/iso4217\">'+ctx('a')+unit+'</div></ix:resources></ix:header>'+fact('a','5')+'</body></html>'];
for(const doc of docs)try { console.log(trimInlineXbrl(doc,{keep:n=>n==='us-gaap:Assets'})); }catch(e){console.log(e.message)}
JS
nl -ba src/lib/dq/reconcile/ixbrl-trim.ts | sed -n '108,145p'; cat src/lib/supabase/admin.ts; cat package.json | head -55" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
zsh:1: can't create temp file for here document: operation not permitted
   108	  const cs=contexts.get(f.contextRef);
   109	  return cs!==undefined&&cs.length===1&&cs[0].dimensional;   // duplicates stay: the parser reports them whatever their content
   110	 };
   111	 const kept=facts.filter(f=>opts.keep(f.name)&&!dropped(f));
   112	 if(kept.some(f=>f.tuple))throw new TrimError('trim_tuple_member',kept.filter(f=>f.tuple).map(f=>f.name));
   113	 // emitted slices: kept facts not already inside an earlier emitted slice
   114	 const emitted:FactSpan[]=[];let lastEnd=-1;
   115	 for(const f of kept)if(f.start>=lastEnd){emitted.push(f);lastEnd=f.end;}
   116	 const inside=facts.filter(f=>emitted.some(e=>f.start>=e.start&&f.end<=e.end));
   117	 const ctxIds=new Set<string>(),unitIds=new Set<string>();
   118	 for(const f of inside){
   119	  if(!dropped(f)&&f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);
   120	  if(f.unitRef!==null&&f.unitRef!==''&&units.has(f.unitRef))unitIds.add(f.unitRef);
   121	 }
   122	 const bySource=(a:Span,b:Span)=>a.start-b.start;
   123	 const keptContexts=[...ctxIds].flatMap(id=>contexts.get(id)!).sort(bySource);
   124	 const keptUnits=[...unitIds].flatMap(id=>units.get(id)!).sort(bySource);
   125	 const wrap=(s:Span)=>sliceWith(doc,s,rootNs);
   126	 const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
   127	  `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
   128	  ...emitted.map(f=>`<p${declsFor(f.parentNs,rootNs)}>${doc.slice(f.start,f.end)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
   129	
   130	 // safety net
   131	 const diff=equivalence(parseInlineXbrl(doc),parseInlineXbrl(html),opts.keep);
   132	 if(diff.length>0)throw new TrimError('trim_not_equivalent',diff.slice(0,10));
   133	 return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
   134	}
   135	
   136	/** Keys that differ between the original and trimmed parses, restricted to the selected concepts. */
   137	export function equivalence(a:IxbrlDocument,b:IxbrlDocument,keep:(n:string)=>boolean):string[]{
   138	 const facts=(d:IxbrlDocument)=>d.facts.filter(f=>keep(f.name)).map(f=>`fact ${ixFactKey(f)}=${f.value}@${f.decimals??''}`);
   139	 const nn=(d:IxbrlDocument)=>Object.entries(d.nonNumeric).filter(([k])=>keep(k)).map(([k,v])=>`nonNumeric ${k}=${v}`);
   140	 const uns=(d:IxbrlDocument)=>d.unsupported.filter(u=>u.name!==undefined&&keep(u.name)).map(u=>`unsupported ${JSON.stringify([u.reason,u.name,u.contextRef??'',u.periodStart??'',u.periodEnd??''])}`);
   141	 const out:string[]=[];
   142	 for(const pick of [facts,nn,uns]){
   143	  const x=pick(a).sort(),y=pick(b).sort();
   144	  const cnt=(l:string[])=>{const m=new Map<string,number>();for(const k of l)m.set(k,(m.get(k)??0)+1);return m;};
   145	  const cx=cnt(x),cy=cnt(y);
// ⚠️ SERVICE-ROLE CLIENT — BYPASSES ROW LEVEL SECURITY. ⚠️
//
// This client authenticates as the Supabase service_role and can read/write
// ANY row in ANY table, ignoring every RLS policy. It must ONLY be imported
// from trusted system contexts: unauthenticated webhooks that verify their own
// signatures, or admin routes after a user-session and role check has passed.
//
// Browser-originated routes must use getServerSupabase() for their access
// checks before constructing this client. Never use a request parameter or
// cookie value alone to authorize service-role access.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

function adminCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) not configured — admin client unavailable'
    );
  }
  return { url, serviceRoleKey };
}

export function getAdminSupabase() {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Narrow RPC schema: the legacy Database table shapes omit Relationships/Views
// required by current supabase-js inference. Keep this new RPC fully typed
// without changing every existing table client or casting arguments to never.
type QuoteAlertDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Pick<Database['public']['Functions'], 'quote_alert_window_samples'>;
  };
};
export function getQuoteAlertSupabase() {
  const { url, serviceRoleKey } = adminCredentials();
  return createClient<QuoteAlertDatabase>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

exec
/bin/zsh -lc "node -e 'const ts=require(\"typescript\"),fs=require(\"fs\");require.extensions[\".ts\"]=(m,f)=>m._compile(ts.transpile(fs.readFileSync(f,\"utf8\"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f);const {trimInlineXbrl}=require(\"./src/lib/dq/reconcile/ixbrl-trim.ts\");const ctx=(id,extra=\"\")=>"'`<x:context id="${id}"><x:entity><x:identifier scheme="cik">1</x:identifier>${extra}</x:entity><x:period><x:instant>2023-09-30</x:instant></x:period></x:context>`;const unit=`<x:unit id="u"><x:measure>iso:USD</x:measure></x:unit>`;const fact=(c,v)=>`<ix:nonFraction name="us-gaap:Assets" contextRef="${c}" unitRef="u">${v}</ix:nonFraction>`;const root=`<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:x="http://www.xbrl.org/2003/instance" xmlns:iso="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2023">`;const docs=[root+"<body><ix:header><ix:resources>"+ctx("a")+ctx("b","<x:segment><dim/></x:segment>")+unit+"</ix:resources></ix:header>"+fact("a",fact("b","5"))+"</body></html>",root+`<body><ix:header><ix:resources xmlns:iso="urn:other"><div xmlns:iso="http://www.xbrl.org/2003/iso4217">`+ctx("a")+unit+"</div></ix:resources></ix:header>"+fact("a","5")+"</body></html>"];for(const doc of docs)try{console.log(trimInlineXbrl(doc,{keep:n=>n==="us-gaap:Assets"}))}catch(e){console.log(e.message)}'"'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 534ms:
trim_not_equivalent: unsupported ["context","us-gaap:Assets","b","",""] (original 0, trimmed 1)
trim_not_equivalent: fact us-gaap:Assets|cik#1||2023-09-30|USD=5@ (original 1, trimmed 0); unsupported ["unit","us-gaap:Assets","a","","2023-09-30"] (original 0, trimmed 1)

codex
Two reproduced edge cases cause the trimmer to reject documents because its output changes parser semantics: nested dimensional facts lose their contexts, and resource namespace shadowing is reconstructed incorrectly.

Full review comments:

- [P2] Preserve contexts for dimensional facts inside emitted slices — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:119-119
  When a selected non-dimensional fact contains a dimensional fact for a selected concept, the inner fact remains in the emitted source slice, but this condition removes its context. The original parser silently skips that dimensional fact; the trimmed parser instead reports `unsupported(context)`, causing the new equivalence check to reject the entire trim. Retain contexts for every fact physically present in an emitted slice, even when that fact would not be selected independently.

- [P2] Compare resource bindings against the destination namespace scope — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:125-125
  Contexts and units are emitted under the reconstructed resources element, not directly under the root. Comparing their bindings against `rootNs` omits necessary declarations when resources shadows a root binding and a source descendant restores it. For example, if resources rebinds `iso` and a descendant restores the root ISO4217 binding around a USD unit, trimming changes that unit to unsupported and throws `trim_not_equivalent`. Pass the destination resources namespace scope to `sliceWith` instead.
Two reproduced edge cases cause the trimmer to reject documents because its output changes parser semantics: nested dimensional facts lose their contexts, and resource namespace shadowing is reconstructed incorrectly.

Full review comments:

- [P2] Preserve contexts for dimensional facts inside emitted slices — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:119-119
  When a selected non-dimensional fact contains a dimensional fact for a selected concept, the inner fact remains in the emitted source slice, but this condition removes its context. The original parser silently skips that dimensional fact; the trimmed parser instead reports `unsupported(context)`, causing the new equivalence check to reject the entire trim. Retain contexts for every fact physically present in an emitted slice, even when that fact would not be selected independently.

- [P2] Compare resource bindings against the destination namespace scope — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:125-125
  Contexts and units are emitted under the reconstructed resources element, not directly under the root. Comparing their bindings against `rootNs` omits necessary declarations when resources shadows a root binding and a source descendant restores it. For example, if resources rebinds `iso` and a descendant restores the root ISO4217 binding around a USD unit, trimming changes that unit to unsupported and throws `trim_not_equivalent`. Pass the destination resources namespace scope to `sliceWith` instead.

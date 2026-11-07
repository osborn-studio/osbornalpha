OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0e7-d576-7a51-a8ff-5eb7be8ce0dc
--------
user
commit 1338df3
exec
/bin/zsh -lc 'pwd; git status --short; git show --stat --oneline 1338df3; cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-6DQlx1oJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-7wA2KsRU' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-xnpgmJRD' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-jMYFSSQn' (errno=Operation not permitted)
1338df3 fix(dq): trimmer context collection and resources scope, recorder argument and size checks
 scripts/dq/record-ixbrl-fixture.ts      | 25 ++++++++++++++-----------
 src/lib/dq/reconcile/ixbrl-trim.test.ts | 20 ++++++++++++++++++++
 src/lib/dq/reconcile/ixbrl-trim.ts      |  5 +++--
 3 files changed, 37 insertions(+), 13 deletions(-)
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

exec
/bin/zsh -lc 'git show 1338df3 --; find .. -name AGENTS.md -o -name AGENTS.override.md; cat AGENTS.md 2>/dev/null; cat src/lib/dq/reconcile/ixbrl-trim.ts; cat scripts/dq/record-ixbrl-fixture.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2805ms:
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0PNKs1f0' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-8y5nySP8' (errno=Operation not permitted)
commit 1338df3df476bb05b125f46f7fb5db1f34732a6c
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:48:50 2026 -0800

    fix(dq): trimmer context collection and resources scope, recorder argument and size checks
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/record-ixbrl-fixture.ts b/scripts/dq/record-ixbrl-fixture.ts
index 5bb3bca..5a8ef57 100644
--- a/scripts/dq/record-ixbrl-fixture.ts
+++ b/scripts/dq/record-ixbrl-fixture.ts
@@ -8,17 +8,18 @@
  *    (primaryDocument, isInlineXBRL, form, filingDate, reportDate) plus the top-level category and
  *    fiscalYearEnd. An accession only reachable through filings.files[] pages is refused (exit 1).
  * 2. GET https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<primaryDocument>.
- * 3. trimInlineXbrl(document, {keep: factConceptKeep, dropDimensional: true}); write <out> and
+ * 3. Both downloaded originals (kinds sec-submissions / sec-document) are retained through a RawStore BEFORE the
+ *    trim and before any fixture output; the run fails if retention fails. --raw-dir <dir> writes
+ *    content-addressed files named exactly like RawStore paths (<kind>/<sha>.<ext> plus .meta.json, never
+ *    overwritten); without it the Supabase store is used when NEXT_PUBLIC_SUPABASE_URL and
+ *    SUPABASE_SERVICE_ROLE_KEY are set, otherwise the run refuses.
+ * 4. trimInlineXbrl(document, {keep: factConceptKeep, dropDimensional: true}); write <out> and
  *    <out>.meta.json {source_url, source_sha256, source_bytes, fetched_at, trim_version, parser_version,
- *    trimmed_sha256, facts, contexts, units, submissions:{url, sha256, accession, form, filingDate,
- *    reportDate, primaryDocument, isInlineXBRL, category, fiscalYearEnd}}.
- * 4. Before any fixture output, both downloaded originals (kinds sec-submissions / sec-document) are retained
- *    through a RawStore; the fixture metadata records their paths and sha256 and the run fails if retention
- *    fails. --raw-dir <dir> writes content-addressed files named exactly like RawStore paths (<kind>/<sha>.<ext>
- *    plus .meta.json, never overwritten); without it the Supabase store is used when NEXT_PUBLIC_SUPABASE_URL
- *    and SUPABASE_SERVICE_ROLE_KEY are set, otherwise the run refuses.
- * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. Nothing is
- * written unless both downloads and the trim succeed. Exit 1 on failure, 2 on bad arguments.
+ *    trimmed_sha256, facts, contexts, units, raw:{document,submissions}:{path,sha256,status},
+ *    submissions:{url, sha256, accession, form, filingDate, reportDate, primaryDocument, isInlineXBRL,
+ *    category, fiscalYearEnd}}.
+ * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. The fixture files are
+ * written only after both downloads, their retention and the trim succeeded. Exit 1 on failure, 2 on bad arguments.
  */
 import {createHash} from 'node:crypto';
 import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
@@ -37,6 +38,8 @@ async function get(url:string):Promise<Uint8Array>{
  await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});   // the one process-wide SEC pacer
  const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'*/*'},signal:AbortSignal.timeout(60_000)});
  if(!res.ok)throw new Error(`http_${res.status} ${url}`);
+ const declared=Number(res.headers.get('content-length'));
+ if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
  return bytes;
@@ -70,7 +73,7 @@ async function rawStoreFor(rawDir:string):Promise<RawStore>{
 
 async function main(){
  const argv=process.argv.slice(2);let cik='',accn='',out='',rawDir='';
- for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
+ for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(v===''){console.error(USAGE);process.exit(2);}if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
  if(!/^[1-9]\d{0,9}$/.test(cik)||!/^\d{10}-\d{2}-\d{6}$/.test(accn)||!out.endsWith('.htm')){console.error(USAGE);process.exit(2);}
  const subUrl=`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
  const subBytes=await get(subUrl);
diff --git a/src/lib/dq/reconcile/ixbrl-trim.test.ts b/src/lib/dq/reconcile/ixbrl-trim.test.ts
index 36d10f7..7d843b4 100644
--- a/src/lib/dq/reconcile/ixbrl-trim.test.ts
+++ b/src/lib/dq/reconcile/ixbrl-trim.test.ts
@@ -77,6 +77,26 @@ describe('trimInlineXbrl (reproducible fixture trimming)',()=>{
    const doc2=mk(CTX('c1')+CTX('c2')+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
    expect(trimInlineXbrl(doc2,{keep:keepAssets})).toMatchObject({facts:1,contexts:2});
   });
+  it('keeps the dimensional context of an unselected fact that sits inside a kept slice',()=>{
+   const seg='<xbrli:segment><x:m xmlns:x="urn:x">m</x:m></xbrli:segment>';
+   const doc=mk(CTX('c1')+CTX('c2',seg)+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(t).toMatchObject({facts:1,contexts:2});
+   expect(t.html).toContain('urn:x');
+  });
+  it('builds context and unit slices against the resources scope (a binding on ix:header is declared once)',()=>{
+   const doc=`<?xml version="1.0"?>\n${ROOT_US.replace(' xmlns:iso4217="http://www.xbrl.org/2003/iso4217"','')}<head/><body><ix:header xmlns:cur="http://www.xbrl.org/2003/iso4217"><ix:resources>${CTX('c1')}<xbrli:unit id="usd"><xbrli:measure>cur:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${NF('us-gaap:Assets','5')}</body></html>`;
+   const t=trimInlineXbrl(doc,{keep:keepAssets});
+   expect(t.html.split('xmlns:cur=').length-1).toBe(1);
+   expect(parseInlineXbrl(t.html).facts.map(f=>f.unit)).toEqual(['USD']);
+  });
+  it('trimInlineXbrl itself throws trim_not_equivalent when copying a context would duplicate a fact nested in it',()=>{
+   const doc=mk(`<xbrli:context id="c1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period>${NF('us-gaap:Assets','5')}</xbrli:context>${USD}`,'');
+   expect(parseInlineXbrl(doc).facts).toHaveLength(1);
+   let err:unknown;try{trimInlineXbrl(doc,{keep:keepAssets});}catch(e){err=e;}
+   expect(err).toBeInstanceOf(TrimError);
+   expect((err as TrimError).message).toMatch(/trim_not_equivalent/);
+  });
   it('keeps a selected fact with a missing context (unsupported is preserved, not lost)',()=>{
    const doc=mk(USD,NF('us-gaap:Assets','5','missing'));
    const t=trimInlineXbrl(doc,{keep:keepAssets});
diff --git a/src/lib/dq/reconcile/ixbrl-trim.ts b/src/lib/dq/reconcile/ixbrl-trim.ts
index a733c8a..dd503dd 100644
--- a/src/lib/dq/reconcile/ixbrl-trim.ts
+++ b/src/lib/dq/reconcile/ixbrl-trim.ts
@@ -116,13 +116,14 @@ export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
  const inside=facts.filter(f=>emitted.some(e=>f.start>=e.start&&f.end<=e.end));
  const ctxIds=new Set<string>(),unitIds=new Set<string>();
  for(const f of inside){
-  if(!dropped(f)&&f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);
+  if(f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);   // every fact physically inside a kept slice, dimensional or not
   if(f.unitRef!==null&&f.unitRef!==''&&units.has(f.unitRef))unitIds.add(f.unitRef);
  }
  const bySource=(a:Span,b:Span)=>a.start-b.start;
  const keptContexts=[...ctxIds].flatMap(id=>contexts.get(id)!).sort(bySource);
  const keptUnits=[...unitIds].flatMap(id=>units.get(id)!).sort(bySource);
- const wrap=(s:Span)=>sliceWith(doc,s,rootNs);
+ const resourcesNs=resources.ns;
+ const wrap=(s:Span)=>sliceWith(doc,s,resourcesNs);   // contexts and units are emitted inside <resources>
  const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
   `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
   ...emitted.map(f=>`<p${declsFor(f.parentNs,rootNs)}>${doc.slice(f.start,f.end)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
// src/lib/dq/reconcile/ixbrl-trim.ts
// Deterministic trimming of a real inline XBRL primary document into a small committed fixture
// (IXBRL_TRIM_VERSION='ixbrl-trim/1'; plan 3 Task 13c). Kept, as verbatim source slices: the root
// element's open tag (every xmlns declaration), each selected ix:nonFraction / ix:nonNumeric (every
// nesting level; a selected fact inside an unselected one is kept on its own), and the xbrli:context /
// xbrli:unit elements that every fact inside a kept slice references. Each slice is emitted with the
// in-scope xmlns bindings it had in the source (from all ancestors), so prefixes inside it (concept
// names, QName-valued measures) still resolve. Facts in dimensional contexts are dropped unless
// dropDimensional:false. Duplicate context / unit ids are all kept (the document stays unsupported
// exactly as the source was); a selected fact inside ix:tuple (or with tupleRef) makes the trim refuse
// (trim_tuple_member). Safety net: the original and the trimmed document are both parsed with
// parseInlineXbrl and, for every selected concept, facts (key, value, decimals), dei texts and
// unsupported entries must be identical, otherwise trim_not_equivalent. Output order is source order,
// one fact per <p>, so identical source bytes always give identical trimmed bytes.
import {FACT_CONCEPTS} from '../../facts/concepts';
import {tagsOf} from '../../facts/providers/edgar-companyfacts';
import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,ixFactKey,parseInlineXbrl,resolveQName,tokenizeXml} from './ixbrl';
import type {IxbrlDocument,NsMap} from './ixbrl';

export const IXBRL_TRIM_VERSION='ixbrl-trim/1';
const KEEP=new Set<string>([...FACT_CONCEPTS.flatMap(c=>tagsOf(c)),...DEI_NON_NUMERIC]);
export const factConceptKeep=(name:string):boolean=>KEEP.has(name);
export interface TrimOptions{keep:(name:string)=>boolean;dropDimensional?:boolean}
export interface TrimResult{html:string;facts:number;contexts:number;units:number}

/** code is 'trim_not_equivalent' | 'trim_tuple_member' (plus the parser's own codes); detail names differing keys. */
export class TrimError extends IxbrlParseError{constructor(code:string,public readonly detail:string[]=[]){super(detail.length>0?`${code}: ${detail.join('; ')}`:code);this.name='TrimError';}}

interface El{name:string;ns:NsMap;uri:string|null;local:string}
interface Span{start:number;end:number;openEnd:number;parentNs:NsMap;own:Set<string>}
interface CtxSpan extends Span{dimensional:boolean}
interface FactSpan extends Span{kind:'nf'|'nn';name:string;contextRef:string;unitRef:string|null;tuple:boolean}
const attrOf=(a:readonly [string,string][],k:string)=>a.find(([n])=>n===k)?.[1];
const isFact=(el:{uri:string|null;local:string})=>el.uri===NS.ix&&(el.local==='nonFraction'||el.local==='nonNumeric');
const esc=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const declOf=(attrs:readonly [string,string][])=>new Set(attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:')).map(([k])=>k==='xmlns'?'':k.slice(6)));
/** xmlns attributes for the bindings in `ns` that differ from `base` (and are not redeclared in `skip`). */
function declsFor(ns:NsMap,base:NsMap,skip?:ReadonlySet<string>):string{
 let s='';
 for(const [p,u] of ns){
  if(p==='xml'||base.get(p)===u||skip?.has(p))continue;
  s+=p===''?` xmlns="${esc(u)}"`:` xmlns:${p}="${esc(u)}"`;
 }
 return s;
}
/** Source slice with extra xmlns attributes inserted into its own open tag. */
function sliceWith(doc:string,s:Span,base:NsMap):string{
 const add=declsFor(s.parentNs,base,s.own);
 if(add==='')return doc.slice(s.start,s.end);
 const open=doc.slice(s.start,s.openEnd);
 const cut=open.endsWith('/>')?open.length-2:open.length-1;
 return open.slice(0,cut)+add+open.slice(cut)+doc.slice(s.openEnd,s.end);
}

export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
 const dropDimensional=opts.dropDimensional??true;
 const root:NsMap=new Map([['xml',NS.xml]]);const stack:El[]=[];
 let rootOpen:string|null=null,rootName='',rootNs:NsMap=root;
 let header:{name:string;ns:NsMap}|null=null,resources:{name:string;ns:NsMap}|null=null;
 const contexts=new Map<string,CtxSpan[]>();const units=new Map<string,Span[]>();const facts:FactSpan[]=[];
 let ctx:(CtxSpan&{id:string;segDepth:number})|null=null;
 let unit:(Span&{id:string})|null=null;
 const open:(Omit<FactSpan,'end'>&{depth:number})[]=[];
 let tuples=0;
 const push=<T>(m:Map<string,T[]>,k:string,v:T)=>{const a=m.get(k);if(a)a.push(v);else m.set(k,[v]);};
 const close=(el:El,end:number)=>{
  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){push(contexts,ctx.id,{start:ctx.start,end,openEnd:ctx.openEnd,parentNs:ctx.parentNs,own:ctx.own,dimensional:ctx.dimensional});ctx=null;return;}
  if(ctx!==null&&el.uri===NS.xbrli&&(el.local==='segment'||el.local==='scenario')&&ctx.segDepth===stack.length){ctx.segDepth=-1;return;}
  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){push(units,unit.id,{start:unit.start,end,openEnd:unit.openEnd,parentNs:unit.parentNs,own:unit.own});unit=null;return;}
  const top=open[open.length-1];
  if(top&&stack.length===top.depth&&isFact(el)){open.pop();const {depth:_d,...f}=top;void _d;facts.push({...f,end});}
  if(el.uri===NS.ix&&el.local==='tuple')tuples=Math.max(0,tuples-1);
 };
 for(const tok of tokenizeXml(doc)){
  if(tok.t==='text')continue;
  if(tok.t==='close'){
   const el=stack.pop();
   if(!el||el.name!==tok.name)throw new IxbrlParseError('mismatched_close');
   close(el,tok.end);continue;
  }
  const parentNs=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parentNs;
  const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
  if(decl.length>0){const m=new Map(parentNs);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
  const {uri,local}=resolveQName(tok.name,ns,true);
  const el:El={name:tok.name,ns,uri,local};
  const span={start:tok.start,openEnd:tok.end,parentNs,own:declOf(tok.attrs)};
  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;rootNs=ns;}
  if(ctx!==null&&ctx.segDepth>=0)ctx.dimensional=true;
  else if(uri===NS.ix&&local==='header'&&header===null)header={name:tok.name,ns};
  else if(uri===NS.ix&&local==='resources'&&resources===null)resources={name:tok.name,ns};
  else if(uri===NS.xbrli&&local==='context'&&ctx===null)ctx={...span,end:0,id:attrOf(tok.attrs,'id')??'',dimensional:false,segDepth:-1};
  else if(ctx!==null&&uri===NS.xbrli&&(local==='segment'||local==='scenario'))ctx.segDepth=stack.length;
  else if(uri===NS.xbrli&&local==='unit'&&unit===null)unit={...span,end:0,id:attrOf(tok.attrs,'id')??''};
  else if(isFact(el)){
   const q=resolveQName((attrOf(tok.attrs,'name')??'').trim(),ns,true);
   open.push({...span,depth:stack.length,kind:local==='nonFraction'?'nf':'nn',name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',
    unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null,tuple:tuples>0||attrOf(tok.attrs,'tupleRef')!==undefined});
  }
  if(uri===NS.ix&&local==='tuple'&&!tok.self)tuples++;
  if(tok.self)close(el,tok.end);else stack.push(el);
 }
 if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
 if(rootOpen===null||header===null||resources===null)throw new IxbrlParseError('not_inline_xbrl');

 facts.sort((a,b)=>a.start-b.start);
 const dropped=(f:FactSpan)=>{
  if(f.kind==='nn'||!dropDimensional)return false;
  const cs=contexts.get(f.contextRef);
  return cs!==undefined&&cs.length===1&&cs[0].dimensional;   // duplicates stay: the parser reports them whatever their content
 };
 const kept=facts.filter(f=>opts.keep(f.name)&&!dropped(f));
 if(kept.some(f=>f.tuple))throw new TrimError('trim_tuple_member',kept.filter(f=>f.tuple).map(f=>f.name));
 // emitted slices: kept facts not already inside an earlier emitted slice
 const emitted:FactSpan[]=[];let lastEnd=-1;
 for(const f of kept)if(f.start>=lastEnd){emitted.push(f);lastEnd=f.end;}
 const inside=facts.filter(f=>emitted.some(e=>f.start>=e.start&&f.end<=e.end));
 const ctxIds=new Set<string>(),unitIds=new Set<string>();
 for(const f of inside){
  if(f.contextRef!==''&&contexts.has(f.contextRef))ctxIds.add(f.contextRef);   // every fact physically inside a kept slice, dimensional or not
  if(f.unitRef!==null&&f.unitRef!==''&&units.has(f.unitRef))unitIds.add(f.unitRef);
 }
 const bySource=(a:Span,b:Span)=>a.start-b.start;
 const keptContexts=[...ctxIds].flatMap(id=>contexts.get(id)!).sort(bySource);
 const keptUnits=[...unitIds].flatMap(id=>units.get(id)!).sort(bySource);
 const resourcesNs=resources.ns;
 const wrap=(s:Span)=>sliceWith(doc,s,resourcesNs);   // contexts and units are emitted inside <resources>
 const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
  `<div style="display:none"><${header.name}${declsFor(header.ns,rootNs)}><${resources.name}${declsFor(resources.ns,header.ns)}>`,...keptContexts.map(wrap),...keptUnits.map(wrap),`</${resources.name}></${header.name}></div>`,
  ...emitted.map(f=>`<p${declsFor(f.parentNs,rootNs)}>${doc.slice(f.start,f.end)}</p>`),'</body>',`</${rootName}>`,''].join('\n');

 // safety net
 const diff=equivalence(parseInlineXbrl(doc),parseInlineXbrl(html),opts.keep);
 if(diff.length>0)throw new TrimError('trim_not_equivalent',diff.slice(0,10));
 return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
}

/** Keys that differ between the original and trimmed parses, restricted to the selected concepts. */
export function equivalence(a:IxbrlDocument,b:IxbrlDocument,keep:(n:string)=>boolean):string[]{
 const facts=(d:IxbrlDocument)=>d.facts.filter(f=>keep(f.name)).map(f=>`fact ${ixFactKey(f)}=${f.value}@${f.decimals??''}`);
 const nn=(d:IxbrlDocument)=>Object.entries(d.nonNumeric).filter(([k])=>keep(k)).map(([k,v])=>`nonNumeric ${k}=${v}`);
 const uns=(d:IxbrlDocument)=>d.unsupported.filter(u=>u.name!==undefined&&keep(u.name)).map(u=>`unsupported ${JSON.stringify([u.reason,u.name,u.contextRef??'',u.periodStart??'',u.periodEnd??''])}`);
 const out:string[]=[];
 for(const pick of [facts,nn,uns]){
  const x=pick(a).sort(),y=pick(b).sort();
  const cnt=(l:string[])=>{const m=new Map<string,number>();for(const k of l)m.set(k,(m.get(k)??0)+1);return m;};
  const cx=cnt(x),cy=cnt(y);
  for(const k of new Set([...cx.keys(),...cy.keys()]))if(cx.get(k)!==cy.get(k))out.push(`${k} (original ${cx.get(k)??0}, trimmed ${cy.get(k)??0})`);
 }
 return out;
}
// scripts/dq/record-ixbrl-fixture.ts
/**
 * Records a reproducible trimmed inline XBRL fixture from a real SEC primary document (plan 3 Task 13c).
 *
 *   npx tsx scripts/dq/record-ixbrl-fixture.ts --cik 320193 --accn 0000320193-23-000106 --out src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm --raw-dir <dir>
 *
 * 1. GET https://data.sec.gov/submissions/CIK##########.json and find the accession in filings.recent
 *    (primaryDocument, isInlineXBRL, form, filingDate, reportDate) plus the top-level category and
 *    fiscalYearEnd. An accession only reachable through filings.files[] pages is refused (exit 1).
 * 2. GET https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<primaryDocument>.
 * 3. Both downloaded originals (kinds sec-submissions / sec-document) are retained through a RawStore BEFORE the
 *    trim and before any fixture output; the run fails if retention fails. --raw-dir <dir> writes
 *    content-addressed files named exactly like RawStore paths (<kind>/<sha>.<ext> plus .meta.json, never
 *    overwritten); without it the Supabase store is used when NEXT_PUBLIC_SUPABASE_URL and
 *    SUPABASE_SERVICE_ROLE_KEY are set, otherwise the run refuses.
 * 4. trimInlineXbrl(document, {keep: factConceptKeep, dropDimensional: true}); write <out> and
 *    <out>.meta.json {source_url, source_sha256, source_bytes, fetched_at, trim_version, parser_version,
 *    trimmed_sha256, facts, contexts, units, raw:{document,submissions}:{path,sha256,status},
 *    submissions:{url, sha256, accession, form, filingDate, reportDate, primaryDocument, isInlineXBRL,
 *    category, fiscalYearEnd}}.
 * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. The fixture files are
 * written only after both downloads, their retention and the trim succeeded. Exit 1 on failure, 2 on bad arguments.
 */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
import {memoryRawStore,supabaseRawStore} from '../../src/lib/dq/raw-store';
import type {RawStore} from '../../src/lib/dq/raw-store';
import {budgetFor,secPacer} from '../../src/lib/facts/providers/shared';
import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from '../../src/lib/dq/reconcile/ixbrl-trim';

const USAGE='usage: record-ixbrl-fixture.ts --cik <digits> --accn <##########-##-######> --out <path.htm> [--raw-dir <dir>]';
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');

async function get(url:string):Promise<Uint8Array>{
 await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});   // the one process-wide SEC pacer
 const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'*/*'},signal:AbortSignal.timeout(60_000)});
 if(!res.ok)throw new Error(`http_${res.status} ${url}`);
 const declared=Number(res.headers.get('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_IXBRL_BYTES){await res.body?.cancel();throw new Error(`too_large ${url}`);}
 const bytes=new Uint8Array(await res.arrayBuffer());
 if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
 return bytes;
}

/** Content-addressed files in a directory, named by the RawStore rules (memoryRawStore prepares path and sidecar; existing files are kept). */
function dirRawStore(dir:string):RawStore{
 const mem=memoryRawStore();
 return {
  sha256Of:mem.sha256Of,
  async put(item,budget){
   const r=await mem.put(item,budget);
   for(const [p,bytes] of mem.objects){
    const full=join(dir,p);
    if(existsSync(full))continue;
    mkdirSync(dirname(full),{recursive:true});
    writeFileSync(full,bytes,{flag:'wx'});
   }
   return r;
  },
 };
}
async function rawStoreFor(rawDir:string):Promise<RawStore>{
 if(rawDir)return dirRawStore(rawDir);
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {getAdminSupabase}=await import('../../src/lib/supabase/admin');
  return supabaseRawStore(getAdminSupabase());
 }
 throw new Error('no raw store: pass --raw-dir <dir> or configure Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
}

async function main(){
 const argv=process.argv.slice(2);let cik='',accn='',out='',rawDir='';
 for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(v===''){console.error(USAGE);process.exit(2);}if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else if(k==='--raw-dir')rawDir=v;else{console.error(USAGE);process.exit(2);}}
 if(!/^[1-9]\d{0,9}$/.test(cik)||!/^\d{10}-\d{2}-\d{6}$/.test(accn)||!out.endsWith('.htm')){console.error(USAGE);process.exit(2);}
 const subUrl=`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
 const subBytes=await get(subUrl);
 const sub=JSON.parse(new TextDecoder().decode(subBytes)) as {category?:string;fiscalYearEnd?:string;filings?:{recent?:Record<string,unknown[]>}};
 const recent=sub.filings?.recent??{};
 const idx=(recent.accessionNumber??[]).indexOf(accn);
 if(idx<0)throw new Error(`accession ${accn} not in filings.recent (filings.files pages are not supported by this recorder)`);
 const at=(k:string)=>(recent[k]??[])[idx];
 const primaryDocument=String(at('primaryDocument')??'');
 if(!primaryDocument)throw new Error('no primaryDocument');
 const sourceUrl=`https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g,'')}/${primaryDocument}`;
 const source=await get(sourceUrl);
 const store=await rawStoreFor(rawDir);
 const rawSub=await store.put({kind:'sec-submissions',bytes:subBytes,contentType:'application/json',meta:{source_url:subUrl,accession:accn}});
 const rawDoc=await store.put({kind:'sec-document',bytes:source,contentType:'text/html',meta:{source_url:sourceUrl,accession:accn}});
 const trimmed=trimInlineXbrl(new TextDecoder('utf-8').decode(source),{keep:factConceptKeep,dropDimensional:true});
 const meta={source_url:sourceUrl,source_sha256:sha(source),source_bytes:source.byteLength,fetched_at:new Date().toISOString(),trim_version:IXBRL_TRIM_VERSION,parser_version:IXBRL_PARSER_VERSION,
  trimmed_sha256:sha(trimmed.html),facts:trimmed.facts,contexts:trimmed.contexts,units:trimmed.units,
  raw:{document:{path:rawDoc.path,sha256:rawDoc.sha256,status:rawDoc.status},submissions:{path:rawSub.path,sha256:rawSub.sha256,status:rawSub.status}},
  submissions:{url:subUrl,sha256:sha(subBytes),accession:accn,form:at('form')??null,filingDate:at('filingDate')??null,reportDate:at('reportDate')??null,primaryDocument,isInlineXBRL:at('isInlineXBRL')===1||at('isInlineXBRL')===true,category:sub.category??null,fiscalYearEnd:sub.fiscalYearEnd??null}};
 writeFileSync(out,trimmed.html);
 writeFileSync(`${out}.meta.json`,`${JSON.stringify(meta,null,1)}\n`);
 console.log(JSON.stringify({out,source_sha256:meta.source_sha256,trimmed_sha256:meta.trimmed_sha256,facts:trimmed.facts}));
}

main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});

exec
/bin/zsh -lc 'for p in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$p/$f" ]; then echo "$p/$f"; cat "$p/$f"; fi; done; done; ls -a | head -35; cat package.json; cat src/lib/dq/reconcile/ixbrl-trim.test.ts; grep -n '"'project_doc\\|fallback' /Users/osborn/.codex/config.toml" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
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
// src/lib/dq/reconcile/ixbrl-trim.test.ts
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {IxbrlParseError,parseInlineXbrl} from './ixbrl';
import {IXBRL_TRIM_VERSION,TrimError,equivalence,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';

const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');

describe('trimInlineXbrl (reproducible fixture trimming)',()=>{
 it('keeps every catalogue fact with its contexts and units: the trimmed document parses to the same facts and dei texts',()=>{
  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep});
  expect(IXBRL_TRIM_VERSION).toBe('ixbrl-trim/1');
  expect(t).toMatchObject({facts:14,contexts:5,units:3});   // 11 nonFraction + 3 dei nonNumeric; c-6 (iPhone segment) dropped
  const a=parseInlineXbrl(AAPL),b=parseInlineXbrl(t.html);
  expect(b.facts).toEqual(a.facts);expect(b.nonNumeric).toEqual(a.nonNumeric);expect(b.unsupported).toEqual([]);
  expect(t.html).not.toContain('IPhoneMember');
  expect(t.html.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<!-- ixbrl-trim/1: 14 facts -->\n<html xmlns="http://www.w3.org/1999/xhtml"')).toBe(true);
 });
 it('is deterministic and idempotent',()=>{
  const once=trimInlineXbrl(AAPL,{keep:factConceptKeep}).html;
  expect(trimInlineXbrl(AAPL,{keep:factConceptKeep}).html).toBe(once);
  expect(trimInlineXbrl(once,{keep:factConceptKeep}).html).toBe(once);
 });
 it('keeps only what `keep` selects, with just the referenced context and unit',()=>{
  const t=trimInlineXbrl(AAPL,{keep:n=>n==='us-gaap:Assets'});
  expect(t).toMatchObject({facts:1,contexts:1,units:1});
  expect(parseInlineXbrl(t.html).facts.map(f=>[f.name,f.value])).toEqual([['us-gaap:Assets','352583000000']]);
 });
 it('dropDimensional:false keeps the segment fact and its context',()=>{
  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep,dropDimensional:false});
  expect(t).toMatchObject({facts:15,contexts:6});
  expect(t.html).toContain('IPhoneMember');
 });
 it('refuses a document that is not inline XBRL',()=>{
  expect(()=>trimInlineXbrl('<html><body><p>x</p></body></html>',{keep:factConceptKeep})).toThrow(IxbrlParseError);
 });

 describe('safety net and structure edge cases',()=>{
  const ROOT='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:iso4217="http://www.xbrl.org/2003/iso4217">';
  const CTX=(id:string,extra='')=>`<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier>${extra}</xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>`;
  const USD='<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>';
  const ROOT_US=ROOT.replace('>',' xmlns:us-gaap="http://fasb.org/us-gaap/2023">');
  const mk=(res:string,body:string)=>`<?xml version="1.0"?>\n${ROOT_US}<head/><body><div><ix:header><ix:resources>${res}</ix:resources></ix:header></div>${body}</body></html>`;
  const NF=(n:string,v:string,ctx='c1')=>`<ix:nonFraction name="${n}" contextRef="${ctx}" unitRef="usd" decimals="0">${v}</ix:nonFraction>`;
  const keepAssets=(n:string)=>n==='us-gaap:Assets'||n==='us-gaap:Liabilities';
  it('re-declares namespaces bound on an ancestor (body) for facts, contexts and QName measures',()=>{
   const doc=`<?xml version="1.0"?>\n${ROOT}<head/><body xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:cur="http://www.xbrl.org/2003/iso4217"><ix:header><ix:resources>${CTX('c1')}<xbrli:unit id="usd"><xbrli:measure>cur:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${NF('us-gaap:Assets','5')}</body></html>`;
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   const p=parseInlineXbrl(t.html);
   expect(p.facts.map(f=>[f.name,f.value,f.unit])).toEqual([['us-gaap:Assets','5','USD']]);
   expect(t.html).toContain('xmlns:cur=');
  });
  it('refuses a selected tuple member instead of promoting it',()=>{
   const doc=mk(CTX('c1')+USD,`<ix:tuple name="us-gaap:T" tupleID="t1">${NF('us-gaap:Assets','5')}</ix:tuple>`);
   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(TrimError);
   expect(()=>trimInlineXbrl(doc,{keep:keepAssets})).toThrow(/trim_tuple_member/);
  });
  it('keeps duplicate context ids so the facts stay unsupported, as in the source',()=>{
   const doc=mk(CTX('c1')+CTX('c1')+USD,NF('us-gaap:Assets','5'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t.contexts).toBe(2);
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context_duplicate']);
  });
  it('keeps duplicate unit ids',()=>{
   const doc=mk(CTX('c1')+USD+USD,NF('us-gaap:Assets','5'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t.units).toBe(2);
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['unit']);
  });
  it('keeps a selected fact nested inside an unselected one and the contexts of every fact in a kept slice',()=>{
   const inner=NF('us-gaap:Liabilities','7','c2');
   const doc=mk(CTX('c1')+CTX('c2')+CTX('c3')+USD,`<ix:nonNumeric name="us-gaap:Other" contextRef="c3">x ${inner}</ix:nonNumeric>`);
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t).toMatchObject({facts:1,contexts:1});
   expect(parseInlineXbrl(t.html).facts.map(f=>f.name)).toEqual(['us-gaap:Liabilities']);
   // selected outer with an unselected nested fact: the nested fact's context travels with the slice
   const doc2=mk(CTX('c1')+CTX('c2')+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
   expect(trimInlineXbrl(doc2,{keep:keepAssets})).toMatchObject({facts:1,contexts:2});
  });
  it('keeps the dimensional context of an unselected fact that sits inside a kept slice',()=>{
   const seg='<xbrli:segment><x:m xmlns:x="urn:x">m</x:m></xbrli:segment>';
   const doc=mk(CTX('c1')+CTX('c2',seg)+USD,`<ix:nonNumeric name="us-gaap:Assets" contextRef="c1">y <ix:nonFraction name="us-gaap:Other" contextRef="c2" unitRef="usd">1</ix:nonFraction></ix:nonNumeric>`);
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t).toMatchObject({facts:1,contexts:2});
   expect(t.html).toContain('urn:x');
  });
  it('builds context and unit slices against the resources scope (a binding on ix:header is declared once)',()=>{
   const doc=`<?xml version="1.0"?>\n${ROOT_US.replace(' xmlns:iso4217="http://www.xbrl.org/2003/iso4217"','')}<head/><body><ix:header xmlns:cur="http://www.xbrl.org/2003/iso4217"><ix:resources>${CTX('c1')}<xbrli:unit id="usd"><xbrli:measure>cur:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${NF('us-gaap:Assets','5')}</body></html>`;
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(t.html.split('xmlns:cur=').length-1).toBe(1);
   expect(parseInlineXbrl(t.html).facts.map(f=>f.unit)).toEqual(['USD']);
  });
  it('trimInlineXbrl itself throws trim_not_equivalent when copying a context would duplicate a fact nested in it',()=>{
   const doc=mk(`<xbrli:context id="c1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000000001</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period>${NF('us-gaap:Assets','5')}</xbrli:context>${USD}`,'');
   expect(parseInlineXbrl(doc).facts).toHaveLength(1);
   let err:unknown;try{trimInlineXbrl(doc,{keep:keepAssets});}catch(e){err=e;}
   expect(err).toBeInstanceOf(TrimError);
   expect((err as TrimError).message).toMatch(/trim_not_equivalent/);
  });
  it('keeps a selected fact with a missing context (unsupported is preserved, not lost)',()=>{
   const doc=mk(USD,NF('us-gaap:Assets','5','missing'));
   const t=trimInlineXbrl(doc,{keep:keepAssets});
   expect(parseInlineXbrl(t.html).unsupported.map(u=>u.reason)).toEqual(['context']);
  });
  it('the equivalence check names every differing fact, dei text and unsupported entry',()=>{
   const a=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','5')+NF('us-gaap:Liabilities','6','nope')));
   const b=parseInlineXbrl(mk(CTX('c1')+USD,NF('us-gaap:Assets','9')));
   const d=equivalence(a,b,keepAssets);
   expect(d.length).toBe(3);   // Assets 5 vs 9 (two entries) and the Liabilities unsupported entry
   expect(equivalence(a,a,keepAssets)).toEqual([]);
   expect(()=>{throw new TrimError('trim_not_equivalent',d);}).toThrow(/trim_not_equivalent/);
  });
 });
});

exec
/bin/zsh -lc 'node node_modules/vitest/vitest.mjs run src/lib/dq/reconcile/ixbrl-trim.test.ts --no-cache --configLoader runner' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 965ms:
failed to load config from /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts

⎯⎯⎯⎯⎯⎯⎯ Startup Error ⎯⎯⎯⎯⎯⎯⎯⎯
ReferenceError: __dirname is not defined
    at eval (/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/vitest.config.ts:10:65)
    at async ESModulesEvaluator.runInlinedModule (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:809:3)
    at async ModuleRunner.directRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1270:59)
    at async ModuleRunner.cachedRequest (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1177:73)
    at async ModuleRunner.import (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/module-runner.js:1132:10)
    at async runnerImport (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36558:18)
    at async runnerImportConfigFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37336:35)
    at async loadConfigFromFile (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:37305:42)
    at async resolveConfig (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:36906:22)
    at async _createServer (file:///Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/node_modules/vite/dist/node/chunks/node.js:24268:65)




codex
No actionable regressions were identified in the context retention, namespace scoping, or recorder validation changes. Test execution was blocked by a configuration-loading error (`__dirname is not defined`), so verification is based on code inspection.
No actionable regressions were identified in the context retention, namespace scoping, or recorder validation changes. Test execution was blocked by a configuration-loading error (`__dirname is not defined`), so verification is based on code inspection.

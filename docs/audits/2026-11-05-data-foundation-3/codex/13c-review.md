OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b0da-93e3-7730-9497-1dcb1f1941c5
--------
user
commit a1d9562
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline a1d9562; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 2353ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-D4VXOlD4' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-eSy3LZSH' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-YMOYQ5gP' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DWPErzDh' (errno=Operation not permitted)
a1d9562 feat(dq): deterministic inline XBRL fixture trimmer and SEC recording script
 scripts/dq/record-ixbrl-fixture.ts      | 61 ++++++++++++++++++++++++++
 src/lib/dq/reconcile/ixbrl-trim.test.ts | 37 ++++++++++++++++
 src/lib/dq/reconcile/ixbrl-trim.ts      | 77 +++++++++++++++++++++++++++++++++
 3 files changed, 175 insertions(+)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show a1d9562 --; cat package.json; ls src/lib/dq/reconcile; find . -name CLAUDE.md -o -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 511ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
zsh:1: no matches found: ../../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-yGb6VCGt' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-fCHp2j1J' (errno=Operation not permitted)
commit a1d9562d923a827749e7b6519d05d43df0abb6b1
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 04:34:13 2026 -0800

    feat(dq): deterministic inline XBRL fixture trimmer and SEC recording script
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/dq/record-ixbrl-fixture.ts b/scripts/dq/record-ixbrl-fixture.ts
new file mode 100644
index 0000000..c899bdf
--- /dev/null
+++ b/scripts/dq/record-ixbrl-fixture.ts
@@ -0,0 +1,61 @@
+// scripts/dq/record-ixbrl-fixture.ts
+/**
+ * Records a reproducible trimmed inline XBRL fixture from a real SEC primary document (plan 3 Task 13c).
+ *
+ *   npx tsx scripts/dq/record-ixbrl-fixture.ts --cik 320193 --accn 0000320193-23-000106 --out src/lib/dq/fixtures/ixbrl/aapl-20230930.trimmed.htm
+ *
+ * 1. GET https://data.sec.gov/submissions/CIK##########.json and find the accession in filings.recent
+ *    (primaryDocument, isInlineXBRL, form, filingDate, reportDate) plus the top-level category and
+ *    fiscalYearEnd. An accession only reachable through filings.files[] pages is refused (exit 1).
+ * 2. GET https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/<primaryDocument>.
+ * 3. trimInlineXbrl(document, {keep: factConceptKeep, dropDimensional: true}); write <out> and
+ *    <out>.meta.json {source_url, source_sha256, source_bytes, fetched_at, trim_version, parser_version,
+ *    trimmed_sha256, facts, contexts, units, submissions:{url, sha256, accession, form, filingDate,
+ *    reportDate, primaryDocument, isInlineXBRL, category, fiscalYearEnd}}.
+ * User-Agent = EDGAR_USER_AGENT or DEFAULT_USER_AGENT; paced by the process-wide secPacer. Nothing is
+ * written unless both downloads and the trim succeed. Exit 1 on failure, 2 on bad arguments.
+ */
+import {createHash} from 'node:crypto';
+import {writeFileSync} from 'node:fs';
+import {DEFAULT_USER_AGENT} from '../../src/lib/research/ingest/collectors/shared';
+import {budgetFor,secPacer} from '../../src/lib/facts/providers/shared';
+import {IXBRL_PARSER_VERSION,MAX_IXBRL_BYTES} from '../../src/lib/dq/reconcile/ixbrl';
+import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from '../../src/lib/dq/reconcile/ixbrl-trim';
+
+const USAGE='usage: record-ixbrl-fixture.ts --cik <digits> --accn <##########-##-######> --out <path.htm>';
+const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
+
+async function get(url:string):Promise<Uint8Array>{
+ await secPacer.admit({budget:budgetFor(120_000),reserveMs:0});   // the one process-wide SEC pacer
+ const res=await fetch(url,{headers:{'User-Agent':process.env.EDGAR_USER_AGENT??DEFAULT_USER_AGENT,Accept:'*/*'},signal:AbortSignal.timeout(60_000)});
+ if(!res.ok)throw new Error(`http_${res.status} ${url}`);
+ const bytes=new Uint8Array(await res.arrayBuffer());
+ if(bytes.byteLength>MAX_IXBRL_BYTES)throw new Error(`too_large ${url}`);
+ return bytes;
+}
+
+async function main(){
+ const argv=process.argv.slice(2);let cik='',accn='',out='';
+ for(let i=0;i<argv.length;i+=2){const k=argv[i],v=argv[i+1]??'';if(k==='--cik')cik=v;else if(k==='--accn')accn=v;else if(k==='--out')out=v;else{console.error(USAGE);process.exit(2);}}
+ if(!/^[1-9]\d{0,9}$/.test(cik)||!/^\d{10}-\d{2}-\d{6}$/.test(accn)||!out.endsWith('.htm')){console.error(USAGE);process.exit(2);}
+ const subUrl=`https://data.sec.gov/submissions/CIK${cik.padStart(10,'0')}.json`;
+ const subBytes=await get(subUrl);
+ const sub=JSON.parse(new TextDecoder().decode(subBytes)) as {category?:string;fiscalYearEnd?:string;filings?:{recent?:Record<string,unknown[]>}};
+ const recent=sub.filings?.recent??{};
+ const idx=(recent.accessionNumber??[]).indexOf(accn);
+ if(idx<0)throw new Error(`accession ${accn} not in filings.recent (filings.files pages are not supported by this recorder)`);
+ const at=(k:string)=>(recent[k]??[])[idx];
+ const primaryDocument=String(at('primaryDocument')??'');
+ if(!primaryDocument)throw new Error('no primaryDocument');
+ const sourceUrl=`https://www.sec.gov/Archives/edgar/data/${cik}/${accn.replace(/-/g,'')}/${primaryDocument}`;
+ const source=await get(sourceUrl);
+ const trimmed=trimInlineXbrl(new TextDecoder('utf-8').decode(source),{keep:factConceptKeep,dropDimensional:true});
+ const meta={source_url:sourceUrl,source_sha256:sha(source),source_bytes:source.byteLength,fetched_at:new Date().toISOString(),trim_version:IXBRL_TRIM_VERSION,parser_version:IXBRL_PARSER_VERSION,
+  trimmed_sha256:sha(trimmed.html),facts:trimmed.facts,contexts:trimmed.contexts,units:trimmed.units,
+  submissions:{url:subUrl,sha256:sha(subBytes),accession:accn,form:at('form')??null,filingDate:at('filingDate')??null,reportDate:at('reportDate')??null,primaryDocument,isInlineXBRL:at('isInlineXBRL')===1||at('isInlineXBRL')===true,category:sub.category??null,fiscalYearEnd:sub.fiscalYearEnd??null}};
+ writeFileSync(out,trimmed.html);
+ writeFileSync(`${out}.meta.json`,`${JSON.stringify(meta,null,1)}\n`);
+ console.log(JSON.stringify({out,source_sha256:meta.source_sha256,trimmed_sha256:meta.trimmed_sha256,facts:trimmed.facts}));
+}
+
+main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
diff --git a/src/lib/dq/reconcile/ixbrl-trim.test.ts b/src/lib/dq/reconcile/ixbrl-trim.test.ts
new file mode 100644
index 0000000..fb9253c
--- /dev/null
+++ b/src/lib/dq/reconcile/ixbrl-trim.test.ts
@@ -0,0 +1,37 @@
+// src/lib/dq/reconcile/ixbrl-trim.test.ts
+import {readFileSync} from 'node:fs';
+import {describe,expect,it} from 'vitest';
+import {IxbrlParseError,parseInlineXbrl} from './ixbrl';
+import {IXBRL_TRIM_VERSION,factConceptKeep,trimInlineXbrl} from './ixbrl-trim';
+
+const AAPL=readFileSync(new URL('../fixtures/ixbrl/aapl-10k-2023.handtrim.htm',import.meta.url),'utf8');
+
+describe('trimInlineXbrl (reproducible fixture trimming)',()=>{
+ it('keeps every catalogue fact with its contexts and units: the trimmed document parses to the same facts and dei texts',()=>{
+  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep});
+  expect(IXBRL_TRIM_VERSION).toBe('ixbrl-trim/1');
+  expect(t).toMatchObject({facts:14,contexts:5,units:3});   // 11 nonFraction + 3 dei nonNumeric; c-6 (iPhone segment) dropped
+  const a=parseInlineXbrl(AAPL),b=parseInlineXbrl(t.html);
+  expect(b.facts).toEqual(a.facts);expect(b.nonNumeric).toEqual(a.nonNumeric);expect(b.unsupported).toEqual([]);
+  expect(t.html).not.toContain('IPhoneMember');
+  expect(t.html.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<!-- ixbrl-trim/1: 14 facts -->\n<html xmlns="http://www.w3.org/1999/xhtml"')).toBe(true);
+ });
+ it('is deterministic and idempotent',()=>{
+  const once=trimInlineXbrl(AAPL,{keep:factConceptKeep}).html;
+  expect(trimInlineXbrl(AAPL,{keep:factConceptKeep}).html).toBe(once);
+  expect(trimInlineXbrl(once,{keep:factConceptKeep}).html).toBe(once);
+ });
+ it('keeps only what `keep` selects, with just the referenced context and unit',()=>{
+  const t=trimInlineXbrl(AAPL,{keep:n=>n==='us-gaap:Assets'});
+  expect(t).toMatchObject({facts:1,contexts:1,units:1});
+  expect(parseInlineXbrl(t.html).facts.map(f=>[f.name,f.value])).toEqual([['us-gaap:Assets','352583000000']]);
+ });
+ it('dropDimensional:false keeps the segment fact and its context',()=>{
+  const t=trimInlineXbrl(AAPL,{keep:factConceptKeep,dropDimensional:false});
+  expect(t).toMatchObject({facts:15,contexts:6});
+  expect(t.html).toContain('IPhoneMember');
+ });
+ it('refuses a document that is not inline XBRL',()=>{
+  expect(()=>trimInlineXbrl('<html><body><p>x</p></body></html>',{keep:factConceptKeep})).toThrow(IxbrlParseError);
+ });
+});
diff --git a/src/lib/dq/reconcile/ixbrl-trim.ts b/src/lib/dq/reconcile/ixbrl-trim.ts
new file mode 100644
index 0000000..76be474
--- /dev/null
+++ b/src/lib/dq/reconcile/ixbrl-trim.ts
@@ -0,0 +1,77 @@
+// src/lib/dq/reconcile/ixbrl-trim.ts
+// Deterministic trimming of a real inline XBRL primary document into a small committed fixture
+// (IXBRL_TRIM_VERSION='ixbrl-trim/1'; plan 3 Task 13c). Kept, as verbatim source slices: the root
+// element's open tag (every xmlns declaration), each OUTERMOST ix:nonFraction / ix:nonNumeric whose
+// resolved concept name passes `keep` (default factConceptKeep: every FACT_CONCEPTS tag plus the three dei
+// nonNumeric names), and the xbrli:context / xbrli:unit elements those facts reference. Facts in
+// dimensional contexts are dropped unless dropDimensional:false. Output order is source order, one fact
+// per <p>, so identical source bytes always give identical trimmed bytes. Uses the same tokenizer and
+// namespace resolution as ixbrl.ts, so prefixes do not matter.
+import {FACT_CONCEPTS} from '../../facts/concepts';
+import {tagsOf} from '../../facts/providers/edgar-companyfacts';
+import {DEI_NON_NUMERIC,IxbrlParseError,NS,canonicalConcept,resolveQName,tokenizeXml} from './ixbrl';
+import type {NsMap} from './ixbrl';
+
+export const IXBRL_TRIM_VERSION='ixbrl-trim/1';
+const KEEP=new Set<string>([...FACT_CONCEPTS.flatMap(c=>tagsOf(c)),...DEI_NON_NUMERIC]);
+export const factConceptKeep=(name:string):boolean=>KEEP.has(name);
+export interface TrimOptions{keep:(name:string)=>boolean;dropDimensional?:boolean}
+export interface TrimResult{html:string;facts:number;contexts:number;units:number}
+
+interface El{name:string;ns:NsMap;uri:string|null;local:string}
+interface Span{start:number;end:number}
+interface FactSpan extends Span{name:string;contextRef:string;unitRef:string|null}
+const attrOf=(a:readonly [string,string][],k:string)=>a.find(([n])=>n===k)?.[1];
+const isFact=(el:{uri:string|null;local:string})=>el.uri===NS.ix&&(el.local==='nonFraction'||el.local==='nonNumeric');
+
+export function trimInlineXbrl(doc:string,opts:TrimOptions):TrimResult{
+ const dropDimensional=opts.dropDimensional??true;
+ const root:NsMap=new Map([['xml',NS.xml]]);const stack:El[]=[];
+ let rootOpen:string|null=null,rootName='',headerName:string|null=null,resourcesName:string|null=null;
+ const contexts=new Map<string,Span&{dimensional:boolean}>();const units=new Map<string,Span>();const facts:FactSpan[]=[];
+ let ctx:{id:string;start:number;dimensional:boolean;segDepth:number}|null=null;
+ let unit:{id:string;start:number}|null=null;
+ let fact:{depth:number;start:number;name:string;contextRef:string;unitRef:string|null}|null=null;
+ const close=(el:El,end:number)=>{
+  if(ctx!==null&&el.uri===NS.xbrli&&el.local==='context'){contexts.set(ctx.id,{start:ctx.start,end,dimensional:ctx.dimensional});ctx=null;return;}
+  if(ctx!==null&&el.uri===NS.xbrli&&(el.local==='segment'||el.local==='scenario')&&ctx.segDepth===stack.length){ctx.segDepth=-1;return;}
+  if(unit!==null&&el.uri===NS.xbrli&&el.local==='unit'){units.set(unit.id,{start:unit.start,end});unit=null;return;}
+  if(fact!==null&&stack.length===fact.depth&&isFact(el)){facts.push({...fact,end});fact=null;}
+ };
+ for(const tok of tokenizeXml(doc)){
+  if(tok.t==='text')continue;
+  if(tok.t==='close'){
+   const el=stack.pop();
+   if(!el||el.name!==tok.name)throw new IxbrlParseError('mismatched_close');
+   close(el,tok.end);continue;
+  }
+  const parent=stack.length>0?stack[stack.length-1].ns:root;let ns:NsMap=parent;
+  const decl=tok.attrs.filter(([k])=>k==='xmlns'||k.startsWith('xmlns:'));
+  if(decl.length>0){const m=new Map(parent);for(const [k,v] of decl)m.set(k==='xmlns'?'':k.slice(6),v);ns=m;}
+  const {uri,local}=resolveQName(tok.name,ns,true);
+  const el:El={name:tok.name,ns,uri,local};
+  if(rootOpen===null){rootOpen=doc.slice(tok.start,tok.end);rootName=tok.name;}
+  if(ctx!==null&&ctx.segDepth>=0)ctx.dimensional=true;
+  else if(uri===NS.ix&&local==='header'&&headerName===null)headerName=tok.name;
+  else if(uri===NS.ix&&local==='resources'&&resourcesName===null)resourcesName=tok.name;
+  else if(uri===NS.xbrli&&local==='context')ctx={id:attrOf(tok.attrs,'id')??'',start:tok.start,dimensional:false,segDepth:-1};
+  else if(ctx!==null&&uri===NS.xbrli&&(local==='segment'||local==='scenario'))ctx.segDepth=stack.length;
+  else if(uri===NS.xbrli&&local==='unit')unit={id:attrOf(tok.attrs,'id')??'',start:tok.start};
+  else if(fact===null&&isFact(el)){
+   const q=resolveQName((attrOf(tok.attrs,'name')??'').trim(),ns,true);
+   fact={depth:stack.length,start:tok.start,name:canonicalConcept(q.uri,q.local),contextRef:attrOf(tok.attrs,'contextRef')??'',unitRef:local==='nonFraction'?(attrOf(tok.attrs,'unitRef')??''):null};
+  }
+  if(tok.self)close(el,tok.end);else stack.push(el);
+ }
+ if(stack.length>0)throw new IxbrlParseError('unclosed_elements');
+ if(rootOpen===null||headerName===null||resourcesName===null)throw new IxbrlParseError('not_inline_xbrl');
+ const kept=facts.filter(f=>{const c=contexts.get(f.contextRef);return opts.keep(f.name)&&c!==undefined&&!(dropDimensional&&c.dimensional);});
+ const bySource=(a:Span,b:Span)=>a.start-b.start;
+ const keptContexts=[...new Set(kept.map(f=>f.contextRef))].map(id=>contexts.get(id)!).sort(bySource);
+ const keptUnits=[...new Set(kept.map(f=>f.unitRef).filter((u):u is string=>u!==null&&units.has(u)))].map(id=>units.get(id)!).sort(bySource);
+ const slice=(s:Span)=>doc.slice(s.start,s.end);
+ const html=['<?xml version="1.0" encoding="utf-8"?>',`<!-- ${IXBRL_TRIM_VERSION}: ${kept.length} facts -->`,rootOpen,'<head><title>trimmed</title></head>','<body>',
+  `<div style="display:none"><${headerName}><${resourcesName}>`,...keptContexts.map(slice),...keptUnits.map(slice),`</${resourcesName}></${headerName}></div>`,
+  ...kept.map(f=>`<p>${slice(f)}</p>`),'</body>',`</${rootName}>`,''].join('\n');
+ return {html,facts:kept.length,contexts:keptContexts.length,units:keptUnits.length};
+}
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
decimal.test.ts
decimal.ts
inputs-hash.test.ts
inputs-hash.ts
ixbrl-trim.test.ts
ixbrl-trim.ts
ixbrl.test.ts
ixbrl.ts
record.test.ts
record.ts
types.ts

exec
/bin/zsh -lc "cat ../../../AGENTS.md; sed -n '1,240p' src/lib/dq/reconcile/ixbrl.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/dq/reconcile/ixbrl.ts
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

exec
/bin/zsh -lc "rg -n 'nested|xmlns|tuple' src/lib/dq/reconcile/ixbrl.test.ts; ls node_modules/.bin/tsx node_modules/.bin/tsc; sed -n '1,80p' src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm; sed -n '1,70p' src/lib/facts/providers/shared.ts; git status --short; find /Volumes/AIMATE_WORK/Developer -maxdepth 2 -name AGENTS.md" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 20ms:
8:/** Renames every prefix: xmlns declarations, element names, QName attribute values and QName text (measure, explicitMember). */
13:  out=out.replaceAll(`xmlns:${from}=`,`xmlns:${to}=`).replace(new RegExp(`(?<=[<\\/"\\s>])${esc}:`,'g'),`${to}:`);
17:const HEAD='<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:ixt3="http://www.xbrl.org/inlineXBRL/transformation/2015-02-26" xmlns:ixt5="http://www.xbrl.org/inlineXBRL/transformation/2022-02-16" xmlns:ixt-sec="http://www.sec.gov/inlineXBRL/transformation/2015-08-31" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">';
55: it('resolves namespaces by xmlns declarations: a document with every prefix renamed parses identically',()=>{
61:  const foreign=AAPL.replace('</body>','<p><foo:nonFraction xmlns:foo="urn:not-ix" name="us-gaap:Liabilities" contextRef="c-4" unitRef="usd">1</foo:nonFraction></p></body>');
100: it('a nested nonFraction gives the outer fact the innermost text; ix:exclude text is not fact text',()=>{
109:  const res=RES+ctx('typed',DUR,{segment:'<xbrldi:typedMember dimension="us-gaap:X"><us-gaap:Y>1</us-gaap:Y></xbrldi:typedMember>'})+ctx('scen',DUR,{scenario:'<foo:Plan xmlns:foo="urn:x">budget</foo:Plan>'})+ctx('emptyseg',DUR,{segment:' '});
129:   +'<xbrli:unit id="yr" xmlns:utr="http://www.xbrl.org/2009/utr"><xbrli:measure>utr:Y</xbrli:measure></xbrli:unit>'
141: it('ix:fraction, ix:tuple and tuple members are unsupported; conflicting dei texts drop the key and report',()=>{
142:  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"></ix:tuple><ix:fraction name="us-gaap:F" contextRef="d" unitRef="usd"><ix:numerator>1</ix:numerator><ix:denominator>2</ix:denominator></ix:fraction>'+nf('tupleRef="t1"','1')+'<ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Non-accelerated Filer</ix:nonNumeric>');
144:  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','ix_fraction','tuple_member','nonnumeric_conflict']);
168: it('facts nested anywhere inside ix:tuple are excluded and reported, with or without tupleRef',()=>{
169:  const d=one('<ix:tuple name="us-gaap:T" tupleID="t1"><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="d">Accelerated Filer</ix:nonNumeric><ix:tuple name="us-gaap:U" tupleID="t2">'+nf('','7')+'</ix:tuple></ix:tuple>'+nf('','8','us-gaap:Assets','i'));
172:  expect(d.unsupported.map(u=>u.reason)).toEqual(['ix_tuple','tuple_member','ix_tuple','tuple_member']);
node_modules/.bin/tsc
node_modules/.bin/tsx
<?xml version="1.0" encoding="utf-8"?>
<!-- Hand-trimmed unit-test fixture: Apple Inc. Form 10-K FY2023, accession 0000320193-23-000106, primary document aapl-20230930.htm.
     Values equal the companyfacts entries of that accession in src/lib/facts/fixtures/edgar/CIK0000320193.trimmed.json.
     Reproducible full trims are made by scripts/dq/record-ixbrl-fixture.ts (Task 13c). -->
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:us-gaap="http://fasb.org/us-gaap/2023" xmlns:dei="http://xbrl.sec.gov/dei/2023" xmlns:srt="http://fasb.org/srt/2023" xmlns:aapl="http://www.apple.com/20230930" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>aapl-20230930</title></head>
<body>
<div style="display:none"><ix:header><ix:hidden>
<ix:nonNumeric name="dei:DocumentFiscalYearFocus" contextRef="c-1">2023</ix:nonNumeric>
</ix:hidden><ix:resources>
<xbrli:context id="c-1"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2022-09-25</xbrli:startDate><xbrli:endDate>2023-09-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-2"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2021-09-26</xbrli:startDate><xbrli:endDate>2022-09-24</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-3"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2020-09-27</xbrli:startDate><xbrli:endDate>2021-09-25</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:context id="c-4"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-09-30</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-5"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2023-10-20</xbrli:instant></xbrli:period></xbrli:context>
<xbrli:context id="c-6"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000320193</xbrli:identifier><xbrli:segment><xbrldi:explicitMember dimension="srt:ProductOrServiceAxis">aapl:IPhoneMember</xbrldi:explicitMember></xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2022-09-25</xbrli:startDate><xbrli:endDate>2023-09-30</xbrli:endDate></xbrli:period></xbrli:context>
<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
<xbrli:unit id="usdPerShare"><xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide></xbrli:unit>
<xbrli:unit id="shares"><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unit>
</ix:resources></ix:header></div>
<p>For the fiscal year ended <ix:nonNumeric name="dei:DocumentPeriodEndDate" contextRef="c-1" format="ixt:date-monthname-day-year-en">September 30, 2023</ix:nonNumeric></p>
<p><ix:nonNumeric name="dei:EntityFilerCategory" contextRef="c-1">Large Accelerated Filer</ix:nonNumeric></p>
<p><ix:nonFraction name="dei:EntityCommonStockSharesOutstanding" contextRef="c-5" unitRef="shares" decimals="INF" scale="0" format="ixt:num-dot-decimal">15,552,752,000</ix:nonFraction> shares of common stock were issued and outstanding as of October&#160;20, 2023.</p>
<table>
<tr><td>Total net sales</td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">383,285</ix:nonFraction></td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-2" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">394,328</ix:nonFraction></td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-3" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">365,817</ix:nonFraction></td></tr>
<tr><td>iPhone</td><td>$<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-6" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">200,583</ix:nonFraction></td></tr>
<tr><td>Net income</td><td>$<ix:nonFraction name="us-gaap:NetIncomeLoss" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">96,995</ix:nonFraction></td></tr>
<tr><td>Basic earnings per share</td><td>$<ix:nonFraction name="us-gaap:EarningsPerShareBasic" contextRef="c-1" unitRef="usdPerShare" decimals="2" scale="0" format="ixt:num-dot-decimal">6.16</ix:nonFraction></td></tr>
<tr><td>Cash generated by/(used in) investing activities</td><td><ix:nonFraction name="us-gaap:NetCashProvidedByUsedInInvestingActivities" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">3,705</ix:nonFraction></td><td>(<ix:nonFraction name="us-gaap:NetCashProvidedByUsedInInvestingActivities" contextRef="c-2" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal" sign="-">22,354</ix:nonFraction>)</td></tr>
<tr><td>Total assets</td><td>$<ix:nonFraction name="us-gaap:Assets" contextRef="c-4" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">352,583</ix:nonFraction></td></tr>
<tr><td>Total shareholders' equity</td><td><ix:nonFraction name="us-gaap:StockholdersEquity" contextRef="c-4" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">62,146</ix:nonFraction></td></tr>
</table>
<p>Total net sales were $<ix:nonFraction name="us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax" contextRef="c-1" unitRef="usd" decimals="-6" scale="6" format="ixt:num-dot-decimal">383,285</ix:nonFraction> million in 2023.</p>
</body>
</html>
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-AcXwEcBx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-nesXiktG' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/13c-review.md
/Volumes/AIMATE_WORK/Developer/osstack/AGENTS.md
/Volumes/AIMATE_WORK/Developer/伴元科技/AGENTS.md

exec
/bin/zsh -lc "node -e 'const ts=require(\"typescript\");require.extensions[\".ts\"]=(m,f)=>m._compile(ts.transpile(require(\"fs\").readFileSync(f,\"utf8\"),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),f); const {trimInlineXbrl,factConceptKeep}=require(\"./src/lib/dq/reconcile/ixbrl-trim.ts\");const {parseInlineXbrl}=require(\"./src/lib/dq/reconcile/ixbrl.ts\");const a=require(\"fs\").readFileSync(\"src/lib/dq/fixtures/ixbrl/aapl-10k-2023.handtrim.htm\",\"utf8\"); const ns=\" xmlns:us-gaap=\\\"http://fasb.org/us-gaap/2023\\\"\";const scoped=a.replace(ns,\"\").replace(\"<body>\",\"<body\"+ns+\">\");console.log(\"scoped\",parseInlineXbrl(scoped).facts.length,parseInlineXbrl(trimInlineXbrl(scoped,{keep:factConceptKeep}).html).facts.map(f=>f.name)); const nested=a.replace(\"352,583</ix:nonFraction>\",\"<ix:nonFraction name=\\\"us-gaap:StockholdersEquity\\\" contextRef=\\\"c-1\\\" unitRef=\\\"shares\\\">352,583</ix:nonFraction></ix:nonFraction>\");const t=trimInlineXbrl(nested,{keep:n=>n===\"us-gaap:Assets\"});console.log(\"nested\",t.contexts,t.units,parseInlineXbrl(t.html));'" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 540ms:
scoped 11 [
  'dei:EntityCommonStockSharesOutstanding',
  '{}RevenueFromContractWithCustomerExcludingAssessedTax',
  '{}RevenueFromContractWithCustomerExcludingAssessedTax',
  '{}RevenueFromContractWithCustomerExcludingAssessedTax',
  '{}NetIncomeLoss',
  '{}EarningsPerShareBasic',
  '{}NetCashProvidedByUsedInInvestingActivities',
  '{}NetCashProvidedByUsedInInvestingActivities',
  '{}Assets',
  '{}StockholdersEquity',
  '{}RevenueFromContractWithCustomerExcludingAssessedTax'
]
nested 1 1 {
  facts: [
    {
      name: 'us-gaap:Assets',
      periodStart: null,
      periodEnd: '2023-09-30',
      unit: 'USD',
      value: '352583000000',
      decimals: '-6',
      scale: 6,
      entity: 'http://www.sec.gov/CIK#0000320193',
      contextRef: 'c-4',
      unitRef: 'usd'
    }
  ],
  nonNumeric: {},
  unsupported: [
    {
      reason: 'context',
      name: 'us-gaap:StockholdersEquity',
      contextRef: 'c-1'
    }
  ]
}

codex
The trimmer can change supported facts' identities and omit resources required by retained nested facts. Both failures were reproduced using modified versions of the existing fixture.

Full review comments:

- [P2] Preserve inherited namespaces when relocating source slices — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:73-75
  When a filing declares namespaces on `body`, `ix:header`, `ix:resources`, or another intermediate ancestor, the emitted slices lose those declarations because only the root opening tag is retained. The original document resolves correctly, but the trimmed fixture changes concept identities or loses facts. For example, moving the fixture's `xmlns:us-gaap` declaration onto `body` causes trimmed `us-gaap:Assets` to parse as `{}Assets`. Preserve each retained element's effective namespace bindings, including those needed by QName attribute values and unit measures.

- [P2] Collect resource references from retained nested facts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:70-71
  When a retained outer `ix:nonFraction` contains a nested fact with a different context or unit, its verbatim slice includes that nested fact, but resource collection considers only the outer fact's references. Consequently, the trimmed document contains dangling references and `parseInlineXbrl` reports an unsupported context or unit instead of returning the originally supported nested fact. Collect dependencies from every fact inside each retained slice before pruning contexts and units.
The trimmer can change supported facts' identities and omit resources required by retained nested facts. Both failures were reproduced using modified versions of the existing fixture.

Full review comments:

- [P2] Preserve inherited namespaces when relocating source slices — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:73-75
  When a filing declares namespaces on `body`, `ix:header`, `ix:resources`, or another intermediate ancestor, the emitted slices lose those declarations because only the root opening tag is retained. The original document resolves correctly, but the trimmed fixture changes concept identities or loses facts. For example, moving the fixture's `xmlns:us-gaap` declaration onto `body` causes trimmed `us-gaap:Assets` to parse as `{}Assets`. Preserve each retained element's effective namespace bindings, including those needed by QName attribute values and unit measures.

- [P2] Collect resource references from retained nested facts — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/dq/reconcile/ixbrl-trim.ts:70-71
  When a retained outer `ix:nonFraction` contains a nested fact with a different context or unit, its verbatim slice includes that nested fact, but resource collection considers only the outer fact's references. Consequently, the trimmed document contains dangling references and `parseInlineXbrl` reports an unsupported context or unit instead of returning the originally supported nested fact. Collect dependencies from every fact inside each retained slice before pruning contexts and units.

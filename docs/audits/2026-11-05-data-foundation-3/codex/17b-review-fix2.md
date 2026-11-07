OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b15f-1ef1-78a2-9c0d-3a9d909d2e9d
--------
user
commit 202a746
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat 202a746; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1180ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-AJeM26mf' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-KzRywqFX' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17a-review.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/17b-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VvWYsKVY' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-PtUaPatb' (errno=Operation not permitted)
commit 202a746111214f82ae2141900f0fa8a959ae9f97
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:59:14 2026 -0800

    fix(dq): filerClass recognises tolerant non-accelerated spellings before accelerated
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

 src/lib/dq/filer-categories.test.ts        | 4 ++++
 src/lib/dq/reconcile/pair-us-ixbrl.test.ts | 3 +++
 src/lib/dq/reconcile/pair-us-ixbrl.ts      | 2 +-
 3 files changed, 8 insertions(+), 1 deletion(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a | head -35; git show 202a746; cat src/lib/dq/reconcile/pair-us-ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
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
package-lock.json
package.json
playwright.config.ts
postcss.config.mjs
public
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-mRTA1VPm' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-VQN6wXJ9' (errno=Operation not permitted)
commit 202a746111214f82ae2141900f0fa8a959ae9f97
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:59:14 2026 -0800

    fix(dq): filerClass recognises tolerant non-accelerated spellings before accelerated
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/filer-categories.test.ts b/src/lib/dq/filer-categories.test.ts
index d4e24b51..46b3948e 100644
--- a/src/lib/dq/filer-categories.test.ts
+++ b/src/lib/dq/filer-categories.test.ts
@@ -27,6 +27,10 @@ describe('parseFilerCategory (dei:EntityFilerCategory cover text)',()=>{
   ['Accelerated Filer','accelerated',null],
   ['Non-accelerated Filer','non_accelerated',null],
   ['Non-Accelerated Filer','non_accelerated',null],
+  ['Nonaccelerated Filer','non_accelerated',null],
+  ['Non- accelerated Filer','non_accelerated',null],
+  ['Non accelerated Filer','non_accelerated',null],
+  ['NON  -  ACCELERATED FILER','non_accelerated',null],
   ['Smaller Reporting Accelerated Filer','accelerated',true],
   ['Non-accelerated Filer  Smaller Reporting Company','non_accelerated',true],
  ])('%s → %s (SRC %s)',(raw,acceleration,src)=>{expect(parseFilerCategory(raw)).toEqual({acceleration,smaller_reporting:src});});
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
index 4e180cc5..e4283309 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
@@ -207,6 +207,9 @@ describe('us.companyfacts_vs_ixbrl',()=>{
   const res=await pair.evaluate(big,m);
   expect(res[0]).toMatchObject({outcome:'unsupported',detail:{reason:'document_too_large',right:{content_length:60*1024*1024,bytes_read:0}}});
  });
+ it('filerClass: tolerant non-accelerated spellings are not mistaken for accelerated',()=>{
+  for(const t of ['Nonaccelerated Filer','Non- accelerated Filer','Non accelerated Filer','NON - ACCELERATED FILER'])expect(filerClass(t)).toBe('non_accelerated');
+ });
  it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
   expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
    .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.ts b/src/lib/dq/reconcile/pair-us-ixbrl.ts
index 4144d320..e1eef674 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.ts
@@ -98,8 +98,8 @@ export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFe
 export function filerClass(text:string|null|undefined):'large_accelerated'|'accelerated'|'non_accelerated'|null{
  if(!text)return null;
  const t=text.toLowerCase();
+ if(/non[\s-]*accelerated/.test(t))return 'non_accelerated';   // first: every "non…accelerated" spelling also contains "accelerated filer"
  if(t.includes('large accelerated'))return 'large_accelerated';
- if(t.includes('non-accelerated')||t.includes('non accelerated'))return 'non_accelerated';
  if(t.includes('accelerated filer'))return 'accelerated';
  return null;
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
 if(/non[\s-]*accelerated/.test(t))return 'non_accelerated';   // first: every "non…accelerated" spelling also contains "accelerated filer"
 if(t.includes('large accelerated'))return 'large_accelerated';
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
     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha,...(right.size?right.size:{})}});continue;}
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
     // a mismatch found through the plan-2 tag FALLBACK is a human check, never a quarantine; only exact-tag mismatches quarantine ok rows
     const viaFallback=tag!==l.source_concept;
     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:viaFallback?'review_item':'quarantine_left'});
     results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
      ...(action==='record'?{}:{item:withTagNote(mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash),viaFallback)})});
    }
   }
   return results;
  },
 };
}

exec
/bin/zsh -lc "find . -name CLAUDE.md -not -path './node_modules/*'; for d in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do ls \""'$d"/AGENTS* 2>/dev/null; done; rg -n '"'filerClass|parseFilerCategory' src/lib/dq/filer-categories.ts scripts/dq/select-us-sample.ts; cat package.json | grep -A16 scripts; sed -n '1,100p' src/lib/dq/filer-categories.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 373ms:
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/AGENTS*
zsh:1: no matches found: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/AGENTS*
src/lib/dq/filer-categories.ts:21:import {filerClass,readLimited} from './reconcile/pair-us-ixbrl';
src/lib/dq/filer-categories.ts:42:export function parseFilerCategory(raw:string):{acceleration:Acceleration;smaller_reporting:boolean|null}|null{
src/lib/dq/filer-categories.ts:43: const acceleration=filerClass(raw.replace(/\s+/g,' ').trim());   // the one classifier (pair-us-ixbrl.ts), shared with the reconcile pair
src/lib/dq/filer-categories.ts:120:   const parsed=cover.category===null?null:parseFilerCategory(cover.category);
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

codex
The change correctly recognizes additional non-accelerated spellings before matching accelerated categories. The added regression tests cover those variants, and no actionable defects were identified.
The change correctly recognizes additional non-accelerated spellings before matching accelerated categories. The added regression tests cover those variants, and no actionable defects were identified.

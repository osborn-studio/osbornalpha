OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b135-e2ef-7f70-8440-fdb3d2bee32a
--------
user
commit 67552d2
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 67552d2; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 1248ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-vflWvrId' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BvJzGyEx' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/15a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-O2TH9uGu' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-wgboElPf' (errno=Operation not permitted)
67552d2 fix(dq): tag-fallback mismatches go to review, 429 fails the run, too_large detail
 src/lib/dq/reconcile/pair-us-ixbrl.test.ts | 24 +++++++++++++++++++++++-
 src/lib/dq/reconcile/pair-us-ixbrl.ts      | 25 +++++++++++++++----------
 2 files changed, 38 insertions(+), 11 deletions(-)

exec
/bin/zsh -lc 'pwd; ls -a | head -30; for d in /Volumes /Volumes/AIMATE_WORK /Volumes/AIMATE_WORK/Developer /Volumes/AIMATE_WORK/Developer/CodeX /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees; do for f in AGENTS.override.md AGENTS.md; do if [ -f "$d/$f" ]; then echo "$d/$f"; cat "$d/$f"; fi; done; done; git show 67552d2 --; cat src/lib/dq/reconcile/pair-us-ixbrl.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0PT3RjOJ' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-X5ypoNA1' (errno=Operation not permitted)
commit 67552d27295b00427929761a822b567f6a39485a
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 06:14:12 2026 -0800

    fix(dq): tag-fallback mismatches go to review, 429 fails the run, too_large detail
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
index f4ad2da..4e180cc 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.test.ts
@@ -168,7 +168,7 @@ describe('us.companyfacts_vs_ixbrl',()=>{
   const MB=1024*1024;let pulled=0;
   const stream=(chunks:number)=>new ReadableStream<Uint8Array>({pull(c){if(pulled>=chunks){c.close();return;}pulled++;c.enqueue(new Uint8Array(MB));}});
   const big:PairRunContext={...s.c,fetch:(async()=>new Response(stream(80),{status:200})) as unknown as typeof fetch};
-  expect(await fetchSecDocument(URL1,big)).toEqual({status:'too_large'});
+  expect(await fetchSecDocument(URL1,big)).toMatchObject({status:'too_large',content_length:null});
   expect(pulled).toBeLessThanOrEqual(52);   // cancelled shortly after 50 MB, not drained
   pulled=0;
   const fail:PairRunContext={...s.c,fetch:(async()=>new Response(stream(5),{status:404})) as unknown as typeof fetch};
@@ -185,6 +185,28 @@ describe('us.companyfacts_vs_ixbrl',()=>{
   const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')).map(([,b])=>new TextDecoder().decode(b)).join('');
   expect(meta).toContain('zix-20241231.htm');expect(meta).not.toMatch(/token|secret|\?|#frag/);
  });
+ it('a failed comparison through the tag fallback is a review_item (never a quarantine); an exact-tag mismatch still quarantines',async()=>{
+  const doc=new TextEncoder().encode(new TextDecoder().decode(docOf('5,001')).replace('>1,000<','>1,001<'));
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:doc}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  const res=await pair.evaluate(s.c,m);
+  expect(res[0]).toMatchObject({outcome:'compared',passed:false,action:'review_item',detail:expect.objectContaining({tag_mismatch:true})});
+  expect(res[0].item?.detail).toMatchObject({tag_mismatch:true});
+  expect(res[2]).toMatchObject({passed:false,action:'quarantine_left'});
+ });
+ it('429 is a run failure on the first response (sec_rate_limited), without retry',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:429}});
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
+  await expect(pair.evaluate(s.c,m)).rejects.toThrow('sec_rate_limited');
+  expect(s.fetch).toHaveBeenCalledTimes(1);
+ });
+ it('too_large records Content-Length and bytes read in the result detail',async()=>{
+  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
+  const big:PairRunContext={...s.c,fetch:(async()=>new Response('',{status:200,headers:{'content-length':String(60*1024*1024)}})) as unknown as typeof fetch};
+  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(big);
+  const res=await pair.evaluate(big,m);
+  expect(res[0]).toMatchObject({outcome:'unsupported',detail:{reason:'document_too_large',right:{content_length:60*1024*1024,bytes_read:0}}});
+ });
  it('filerClass: case-insensitive, non-accelerated before accelerated, SRC alone is unknown',()=>{
   expect([filerClass('Large Accelerated Filer'),filerClass('Accelerated Filer'),filerClass('Non-accelerated Filer'),filerClass('Non-accelerated filer<br>Smaller reporting company'),filerClass('Smaller reporting company'),filerClass(null)])
    .toEqual(['large_accelerated','accelerated','non_accelerated','non_accelerated',null,null]);
diff --git a/src/lib/dq/reconcile/pair-us-ixbrl.ts b/src/lib/dq/reconcile/pair-us-ixbrl.ts
index a49d1ac..80687ca 100644
--- a/src/lib/dq/reconcile/pair-us-ixbrl.ts
+++ b/src/lib/dq/reconcile/pair-us-ixbrl.ts
@@ -3,7 +3,7 @@
 // manifest (US_SAMPLE_PATH). Per accession, in this order:
 //  1. no local filing (edgar, accn) → every key left_unlinked (the document is not fetched);
 //  2. right document: is_inline_xbrl=false → unsupported(not_inline_xbrl); else GET doc_url with the shared process-wide SEC pacer
-//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 429/5xx retried twice then THROWN = execution failure),
+//     (secPacer, 120 ms, User-Agent EDGAR_USER_AGENT/default, 5xx retried twice then THROWN, 429 THROWN at once as sec_rate_limited = execution failure),
 //     404 → unsupported(document_not_found), > 50 MB → unsupported(document_too_large); accepted bytes go to
 //     reconcile-raw (content-addressed, sha256 = right_sha256) and are parsed; IxbrlParseError →
 //     unsupported(parse_error:<code>); no ix element → unsupported(not_inline_xbrl);
@@ -44,7 +44,7 @@ const PAIR='us.companyfacts_vs_ixbrl' as const;
 const SIDES={left_source:'edgar.companyfacts',right_source:'edgar.ixbrl'};
 const RESERVE_MS=10_000;
 
-export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large'};
+export type DocFetch={status:'ok';bytes:Uint8Array}|{status:'not_found'}|{status:'too_large';content_length:number|null;bytes_read:number};
 /** Raw-evidence metadata never carries a query string, fragment or credentials: scheme, host and path only. */
 const evidenceUrl=(u:string):string=>{try{const x=new URL(u);return `${x.protocol}//${x.host}${x.pathname}`;}catch{return '';}};
 const FAILURE_BODY_CAP=1024*1024;
@@ -80,15 +80,17 @@ export async function fetchSecDocument(url:string,ctx:PairContext):Promise<DocFe
   if(!(timeout>0))throw new Error('sec_unavailable:budget_exhausted');
   const res=await ctx.fetch(url,{headers:{'User-Agent':ua,Accept:'text/html,application/xhtml+xml'},signal:AbortSignal.any([ctx.budget.signal,AbortSignal.timeout(timeout)])});
   if(res.status===404){await storeFailure(ctx,res,url);return {status:'not_found'};}
-  if(res.status===429||res.status>=500){
+  if(res.status===429){await storeFailure(ctx,res,url);throw new Error('sec_rate_limited');}   // a run failure at once: no retry against a throttling SEC
+  if(res.status>=500){
    await storeFailure(ctx,res,url);
    if(attempt<2){await sleep(1000*2**attempt,ctx.budget.signal);continue;}
    throw new Error(`sec_unavailable:http_${res.status}`);
   }
   if(!res.ok){await storeFailure(ctx,res,url);throw new Error(`sec_unavailable:http_${res.status}`);}
-  if(Number(res.headers.get('content-length')??'0')>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large'};}
+  const cl=res.headers.get('content-length'),declared=cl!==null&&/^\d+$/.test(cl)?Number(cl):null;
+  if(declared!==null&&declared>MAX_IXBRL_BYTES){await res.body?.cancel().catch(()=>undefined);return {status:'too_large',content_length:declared,bytes_read:0};}
   const got=await readLimited(res,MAX_IXBRL_BYTES);
-  return got.exceeded?{status:'too_large'}:{status:'ok',bytes:got.bytes};
+  return got.exceeded?{status:'too_large',content_length:declared,bytes_read:got.bytes.byteLength}:{status:'ok',bytes:got.bytes};
  }
 }
 
@@ -109,11 +111,11 @@ async function loadSample(ctx:PairContext):Promise<{sample:UsSample;sha256:strin
  return {sample:v.sample,sha256};
 }
 
-type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string};
+type Right={kind:'ok';sha256:string;path:string;doc:IxbrlDocument;index:Map<string,{values:string[];facts:IxFact[]}>;shaMismatch:boolean}|{kind:'unsupported';reason:string;sha256:string;size?:{content_length:number|null;bytes_read:number}};
 async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Right>{
  if(f.is_inline_xbrl===false)return {kind:'unsupported',reason:'not_inline_xbrl',sha256:''};
  const got=await fetchSecDocument(f.doc_url,ctx);
- if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:''};
+ if(got.status!=='ok')return {kind:'unsupported',reason:got.status==='not_found'?'document_not_found':'document_too_large',sha256:'',...(got.status==='too_large'?{size:{content_length:got.content_length,bytes_read:got.bytes_read}}:{})};
  const stored=await storeOf(ctx).put({kind:'sec-document',bytes:got.bytes,contentType:'text/html',meta:{url:evidenceUrl(f.doc_url),accn:f.accn,http_status:200}},ctx.budget);
  let doc:IxbrlDocument;
  try{doc=parseInlineXbrl(new TextDecoder('utf-8').decode(got.bytes));}
@@ -123,6 +125,7 @@ async function rightSide(ctx:PairContext,f:SampleFiling,cik:string):Promise<Righ
  return {kind:'ok',sha256:stored.sha256,path:stored.path,doc,index:indexIxFacts(filer),shaMismatch:stored.sha256!==f.doc_sha256};
 }
 
+const withTagNote=<T extends {detail?:Record<string,unknown>}>(item:T,fallback:boolean):T=>fallback?{...item,detail:{...item.detail,tag_mismatch:true}}:item;
 interface KeyLoc{cik:string;accn:string;concept:string;period_start:string|null;period_end:string;unit:string;source_concept:string;origin:string}
 
 export function usCompanyfactsVsIxbrlPair():RegisteredPair{
@@ -175,7 +178,7 @@ export function usCompanyfactsVsIxbrlPair():RegisteredPair{
       left:left?{fact_id:left.fact_id,raw_hash:left.raw_hash,status:left.status,precision:null,precision_note:'not_retained'}:null};
      const backToItem=bound!==undefined&&left!==null;
      const nc=(outcome:Exclude<ReconcileOutcome,'compared'>,detail:Record<string,unknown>)=>notCompared(nk,'numeric',outcome,SIDES,{...base,...detail},{inputs_hash,...(left?{left_fact_id:left.fact_id}:{}),...(backToItem?{action:'quarantine_left' as const,item:mismatchItem(PAIR,nk,left!,null,{document:entry.doc_url,accn},inputs_hash)}:{})});
-     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha}});continue;}
+     if(right.kind==='unsupported'){results[i]=nc('unsupported',{reason:right.reason,right:{document:entry.doc_url,sha256:rightSha,...(right.size?right.size:{})}});continue;}
      const rightBase={document:entry.doc_url,sha256:rightSha,path:right.path,...(right.shaMismatch?{doc_sha_mismatch:true}:{})};
      if(rows.length===0){results[i]=nc('left_missing',{right:rightBase});continue;}
      if(rows.length>1){results[i]=nc('left_ambiguous',{fact_ids:rows.map(r=>r.fact_id),right:rightBase});continue;}
@@ -194,10 +197,12 @@ export function usCompanyfactsVsIxbrlPair():RegisteredPair{
      if(hit.values.length>1){results[i]=nc('right_ambiguous',{right:{...rightBase,locator,values:hit.values}});continue;}
      const rv=hit.values[0];
      const passed=compareDecimal(l.value,rv)===0;
-     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:'quarantine_left'});
+     // a mismatch found through the plan-2 tag FALLBACK is a human check, never a quarantine; only exact-tag mismatches quarantine ok rows
+     const viaFallback=tag!==l.source_concept;
+     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:viaFallback?'review_item':'quarantine_left'});
      results[i]=comparedNumeric(nk,l.value,rv,{passed,tolerance:'0',sides:SIDES,inputs_hash,left_fact_id:l.fact_id,action,
       detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
-      ...(action==='record'?{}:{item:mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash)})});
+      ...(action==='record'?{}:{item:withTagNote(mismatchItem(PAIR,nk,l,rv,{...locator,document:entry.doc_url},inputs_hash),viaFallback)})});
     }
    }
    return results;
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
/bin/zsh -lc "rg -n 'actionFor|review_item|quarantine_left' src/lib/dq/reconcile/{pair-support.ts,runner.ts,types.ts}; rg -n 'review_item|tag_mismatch' src/lib/dq -g '*.ts' | head -65; cat package.json | head -65; find . -name '*AGENTS*' -not -path './node_modules/*'; rg -n 'function mismatchItem|function actionFor' src/lib/dq/reconcile/pair-support.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 85ms:
rg: src/lib/dq/reconcile/runner.ts: No such file or directory (os error 2)
src/lib/dq/reconcile/pair-support.ts:10:// kind/side rules; actionFor is the one action rule every fact-backed pair uses (contract note 2).
src/lib/dq/reconcile/pair-support.ts:92:export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
src/lib/dq/reconcile/pair-support.ts:93: if(o.bound)return 'quarantine_left';
src/lib/dq/reconcile/types.ts:16:export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
src/lib/dq/reconcile/types.ts:24: item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
src/lib/dq/reconcile/pair-support.ts:92:export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
src/lib/dq/dq-extensions.integration.test.ts:744:   expect(await fails(apply(fence,res('k0',{action:'review_item'})))).toMatchObject({message:'invalid_result'});          // item required
src/lib/dq/dq-extensions.integration.test.ts:765:   const rv=await apply(fence,res('k4',{action:'review_item',item:{natural_key:`${pair}:k4`,payload:{fact_ids:[r],left_value:'100',right_value:'99'}}}));
src/lib/dq/dq-extensions.integration.test.ts:887:   const mk=(key:string)=>res(key,{action:'review_item',item:{natural_key:nk,payload:{fact_ids:[],values:[]}}});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:22: k('revenue',D,'us-gaap:Revenues','both'),               // tag fallback in the document → passed, tag_mismatch
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:93:  expect(res[0]).toMatchObject({left_value:'1000',right_value:'1000',left_fact_id:rev.fact_id,detail:expect.objectContaining({tag_mismatch:true,right:expect.objectContaining({sha256:docSha,locator:expect.objectContaining({name:'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax'})})})});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:95:  expect(res[1].detail.tag_mismatch).toBeUndefined();
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:188: it('a failed comparison through the tag fallback is a review_item (never a quarantine); an exact-tag mismatch still quarantines',async()=>{
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:193:  expect(res[0]).toMatchObject({outcome:'compared',passed:false,action:'review_item',detail:expect.objectContaining({tag_mismatch:true})});
src/lib/dq/reconcile/pair-us-ixbrl.test.ts:194:  expect(res[0].item?.detail).toMatchObject({tag_mismatch:true});
src/lib/dq/reconcile/run.test.ts:69:  const h=harness(stubPair([{issuerId:A,market:'US',expectedKeys:keys('k1')}],()=>[rec('k1',{passed:false,left_value:'1',right_value:'2',abs_diff:'1',rel_diff:'0.5',action:'review_item',item:{natural_key:`${PAIR}:k1:x`,payload:{fact_ids:[]},detail:{pair:PAIR,issuer_id:A,market:'US'}}})]));
src/lib/dq/reconcile/types.ts:16:export type ReconcileAction='record'|'quarantine_left'|'review_item'|'lineage_item';
src/lib/dq/reconcile/types.ts:24: item?:{natural_key:string;payload:Record<string,unknown>;detail?:Record<string,unknown>};   // for review_item / lineage_item / quarantine_left
src/lib/dq/reconcile/pair-us-ixbrl.ts:14://     unit, else the plan 2 fallback order (tagsOf) — first present tag, detail.tag_mismatch=true; none →
src/lib/dq/reconcile/pair-us-ixbrl.ts:128:const withTagNote=<T extends {detail?:Record<string,unknown>}>(item:T,fallback:boolean):T=>fallback?{...item,detail:{...item.detail,tag_mismatch:true}}:item;
src/lib/dq/reconcile/pair-us-ixbrl.ts:202:     const action=actionFor({bound:bound!==undefined,leftStatus:l.status,compared:true,passed,onFail:viaFallback?'review_item':'quarantine_left'});
src/lib/dq/reconcile/pair-us-ixbrl.ts:204:      detail:{...base,right:{...rightBase,locator,precision:{decimals:first.decimals,scale:first.scale}},scale:first.scale,...(tag!==l.source_concept?{tag_mismatch:true}:{})},
src/lib/dq/reconcile/pairs.test.ts:48:  expect(actionFor({bound:false,leftStatus:'ok',compared:true,passed:false,onFail:'review_item'})).toBe('review_item');
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
92:export function actionFor(o:{bound:boolean;leftStatus:FactStatus|null;compared:boolean;passed:boolean;onFail:'quarantine_left'|'review_item'}):ReconcileAction{
98:export function mismatchItem(pair:CyclePairId,naturalKey:string,left:FactRow,rightValue:string|null,rightLocator:Record<string,unknown>,inputsHash:string):NonNullable<ReconcileResultInput['item']>{

exec
/bin/zsh -lc "sed -n '65,130p' src/lib/dq/reconcile/pair-support.ts; rg -n \"review_item|quarantine_left|bound_item\" supabase/migrations/*reconcile* | tail -55; sed -n '100,155p' src/lib/dq/reconcile/pair-us-ixbrl.test.ts; rg -n 'review_item|quarantine_left' src/lib/dq/reconcile/run.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 exited 1 in 0ms:
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
}
/** The work item of a fact-backed mismatch (spec §5.6 payload); apply_reconcile_result adds reconciliation_id, latest_result and hook. */
export function mismatchItem(pair:CyclePairId,naturalKey:string,left:FactRow,rightValue:string|null,rightLocator:Record<string,unknown>,inputsHash:string):NonNullable<ReconcileResultInput['item']>{
 return {natural_key:mismatchItemKey(pair,naturalKey,left.fact_id),
  payload:{key:keyComponents(left.issuer_id,left.market,left),fact_ids:[left.fact_id],left_value:left.value,right_value:rightValue,right_locator:rightLocator},
  detail:{pair,inputs_hash:inputsHash,issuer_id:left.issuer_id,market:left.market}};
}
zsh:1: no matches found: supabase/migrations/*reconcile*
  expect(res[4].detail.reason).toBe('nil');
  expect(s.fetch).toHaveBeenCalledTimes(1);
  expect([...s.raw.objects.keys()].some(p=>p.includes(docSha))).toBe(true);
  expect(await s.tables.select('dq_reconciliations',{pair:'sec.filer_category'})).toEqual([]);   // single producer: Task 17b
 });
 it('an open reconcile_mismatch item pins its fact; a corrected document passes and goes back to the item',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,000')}});
  const assets=s.facts.get('total_assets')!;
  const nk=`${CIK}:${ACCN}:total_assets::2024-12-31:USD`;
  await s.tables.insert('dq_quarantine',{id:randomUUID(),dataset:'facts.us',table_name:'financial_facts',natural_key:`us.companyfacts_vs_ixbrl:${nk}:${assets.fact_id}`,reason_code:'reconcile_mismatch',detail:{pair:'us.companyfacts_vs_ixbrl'},payload:{fact_ids:[assets.fact_id]},batch_id:randomUUID(),status:'open',resolved_by:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  const res=await pair.evaluate(s.c,m);
  expect(res[2]).toMatchObject({outcome:'compared',passed:true,action:'quarantine_left',left_fact_id:assets.fact_id});
 });
 it('an accession without a local filing is left_unlinked without fetching; 404 → unsupported(document_not_found); dry run records nothing',async()=>{
  const unlinkedKeys=KEYS.slice(0,4);
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS),filing(UNLINKED,URL2,unlinkedKeys)]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const dry:PairRunContext={...s.c,dryRun:true};
  const [m]=await pair.members(dry);
  const res=await pair.evaluate(dry,m);
  expect(res.slice(0,KEYS.length).every(r=>r.outcome==='unsupported'&&r.detail.reason==='document_not_found')).toBe(true);
  expect(res.slice(KEYS.length).map(r=>r.outcome)).toEqual(['left_unlinked','left_unlinked','left_unlinked','left_unlinked']);
  expect(s.fetch.mock.calls.map(c=>c[0])).toEqual([URL1]);
  expect(await s.tables.select('dq_reconciliations',{})).toEqual([]);
  expect(s.raw.objects.size).toBe(0);   // dry run: the 404 body went to an ephemeral store
 });
 it('is_inline_xbrl=false → every key unsupported(not_inline_xbrl), no fetch; an invalid sample refuses the run',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS,{is_inline_xbrl:false})]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  expect((await pair.evaluate(s.c,m)).every(r=>r.outcome==='unsupported'&&r.detail.reason==='not_inline_xbrl')).toBe(true);
  expect(s.fetch).not.toHaveBeenCalled();
  const bad=await setup({sample:{...sample([filing(ACCN,URL1,KEYS.slice(0,2))])},docs:{}});
  await expect(pair.members(bad.c)).rejects.toMatchObject({code:'invalid_sample_file'});
 });
 it('a 503 after retries is an execution failure (thrown, the runner fails the member), not a result',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:503}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await expect(pair.evaluate(s.c,m)).rejects.toThrow('sec_unavailable:http_503');
  expect(s.fetch).toHaveBeenCalledTimes(3);
 },15_000);
 it('failure bodies are stored as raw evidence without query strings in metadata',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  await pair.evaluate(s.c,m);
  expect(s.raw.objects.size).toBe(2);   // the (empty) 404 body, content-addressed, plus its metadata sidecar
  const meta=[...s.raw.objects.entries()].filter(([p])=>p.endsWith('.meta.json')||p.includes('meta')).map(([,b])=>new TextDecoder().decode(b)).join('');
  expect(meta).toContain('"http_status":404');expect(meta).not.toContain('?');
  expect(JSON.stringify(s.fetch.mock.calls.map(c=>c[0]))).not.toContain('?');
 });
 it('left precision is not published (canonicalised value_text falsifies trailing zeros)',async()=>{
  const s=await setup({sample:sample([filing(ACCN,URL1,KEYS)]),docs:{[URL1]:docOf('5,001')}});
  const pair=usCompanyfactsVsIxbrlPair();const [m]=await pair.members(s.c);
  const res=await pair.evaluate(s.c,m);
  expect(res[0].detail.left).toMatchObject({precision:null,precision_note:'not_retained'});
 });
 it('dry run writes nothing to the injected raw store, for a success and a failure response',async()=>{

exec
/bin/zsh -lc "rg -n \"v_action = 'review_item'|v_action='review_item'|review_item|quarantine_left\" supabase | tail -55; rg -n 'review_item|quarantine_left' src/lib/dq -g '*memory*'; ls supabase" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
supabase/migrations/20261107091000_facts_extensions.sql:886:--  quarantine_left (left_fact_id of the fence member required; any outcome / passed — 接口对齐记录 #5):
supabase/migrations/20261107091000_facts_extensions.sql:896:--  quarantine_left otherwise (passed, or not compared, left ok): the result row only.
supabase/migrations/20261107091000_facts_extensions.sql:897:--  review_item / lineage_item: an open reconcile_review / lineage_conflict item (reused by natural
supabase/migrations/20261107091000_facts_extensions.sql:914:     or coalesce(p_result ->> 'action', '') not in ('record','quarantine_left','review_item','lineage_item')
supabase/migrations/20261107091000_facts_extensions.sql:933:  if (v_action = 'quarantine_left' and v_left is null)
supabase/migrations/20261107091000_facts_extensions.sql:934:     or (v_action in ('review_item','lineage_item')
supabase/migrations/20261107091000_facts_extensions.sql:961:  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
supabase/migrations/20261107091000_facts_extensions.sql:1000:  if v_action in ('review_item','lineage_item') then
supabase/migrations/20261107091000_facts_extensions.sql:1001:    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
config.toml
migrations
migrations.lock.json
seed.sql
tests

exec
/bin/zsh -lc "sed -n '955,1035p' supabase/migrations/20261107091000_facts_extensions.sql; sed -n '1,230p' src/lib/dq/reconcile/run.ts | tail -95; ls -a | grep -E 'CLAUDE|AGENT'; find .claude -maxdepth 2 -type f | head" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
    if not found or f.issuer_id <> c.issuer_id or f.market <> c.market then raise exception 'invalid_result' using errcode = '22023'; end if;
    select r.status into v_run from public.fact_sync_runs r where r.run_id = f.run_id;
  end if;
  -- a failing compare on a published left row that is ok OR already quarantined (for another reason, with no
  -- open item of this pair yet) opens the reconcile_mismatch item, so fact_promote_rows blocks a later generic
  -- promotion; only an ok row changes visibility (status, state_rev, hook, materialize).
  if v_action = 'quarantine_left' and f.status in ('ok', 'quarantined') and v_run = 'published'
     and p_result ->> 'outcome' = 'compared' and (p_result -> 'passed') = 'false'::jsonb then
    v_nk_item := c.pair || ':' || v_nk || ':' || v_left::text;
    if length(v_nk_item) > 512 then raise exception 'invalid_result' using errcode = '22023'; end if;
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = v_nk_item and q.reason_code = 'reconcile_mismatch' and q.status = 'open'
    for update;
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', v_nk_item, 'reconcile_mismatch',
              jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb), 'latest_result', v_latest,
                                 'issuer_id', c.issuer_id, 'market', c.market)
                || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end,
              jsonb_build_object('key', jsonb_build_object('issuer_id', f.issuer_id, 'market', f.market, 'concept', f.concept, 'period_start', f.period_start, 'period_end', f.period_end,
                                                           'consolidation', f.consolidation, 'unit', f.unit, 'available_date', f.available_date),
                                 'fact_ids', jsonb_build_array(v_left), 'left_value', coalesce(p_result -> 'left_value', 'null'::jsonb), 'right_value', coalesce(p_result -> 'right_value', 'null'::jsonb),
                                 'right_locator', coalesce(p_result -> 'detail' -> 'right' -> 'locator', 'null'::jsonb)),
              c.claimed_by, 'open');
    else
      update public.dq_quarantine
      set detail = detail || jsonb_build_object('reconciliation_id', v_rid, 'latest_result', v_latest)
        || case when f.status = 'ok' then jsonb_build_object('hook', jsonb_build_object('stage', 'materialize', 'state', 'pending', 'at', to_jsonb(v_now))) else '{}'::jsonb end
      where id = v_item;
    end if;
    if f.status = 'ok' then
      update public.financial_facts set status = 'quarantined' where fact_id = v_left and status = 'ok';
      v_q := 1;
      update public.fact_sync_scope set state_rev = state_rev + 1, updated_at = now() where issuer_id = c.issuer_id and market = c.market;
      v_mat := jsonb_build_object('issuer_id', c.issuer_id, 'market', c.market);
    end if;
  elsif v_left is not null and f.status = 'quarantined' and p_result ->> 'outcome' = 'compared' then
    with upd as (
      update public.dq_quarantine q set detail = q.detail || jsonb_build_object('latest_result', v_latest)
      where q.table_name = 'financial_facts' and q.reason_code = 'reconcile_mismatch' and q.status = 'open' and q.detail ->> 'pair' = c.pair
        and jsonb_typeof(q.payload -> 'fact_ids') = 'array' and q.payload -> 'fact_ids' ? v_left::text
      returning q.id)
    select upd.id into v_item from upd order by upd.id limit 1;
  end if;
  if v_action in ('review_item','lineage_item') then
    v_reason := case v_action when 'review_item' then 'reconcile_review' else 'lineage_conflict' end;
    -- two members creating the same item key serialise here, the second reuses the open item (no 23505 on the open-key index)
    perform pg_advisory_xact_lock(hashtext('dq_item:' || v_dataset || ':' || v_reason || ':' || (p_result -> 'item' ->> 'natural_key')));
    select q.id into v_item from public.dq_quarantine q
    where q.dataset = v_dataset and q.table_name = 'financial_facts' and q.natural_key = p_result -> 'item' ->> 'natural_key' and q.reason_code = v_reason and q.status = 'open';
    if v_item is null then
      v_item := gen_random_uuid();
      insert into public.dq_quarantine (id, dataset, table_name, natural_key, reason_code, detail, payload, batch_id, status)
      values (v_item, v_dataset, 'financial_facts', p_result -> 'item' ->> 'natural_key', v_reason,
              (case when jsonb_typeof(p_result -> 'item' -> 'detail') = 'object' then p_result -> 'item' -> 'detail' else '{}'::jsonb end)
                || jsonb_build_object('pair', c.pair, 'reconciliation_id', v_rid, 'issuer_id', c.issuer_id, 'market', c.market),
              p_result -> 'item' -> 'payload', c.claimed_by, 'open');
    end if;
  end if;
  insert into public.dq_reconciliations (id, dataset, left_source, right_source, natural_key, left_value, right_value, abs_diff, rel_diff, tolerance, passed, batch_id,
                                         pair, kind, outcome, detail, cycle_id, issuer_id, market, attempt)
  values (v_rid, 'reconcile.' || c.pair, p_result ->> 'left_source', p_result ->> 'right_source', v_nk, v_lv, v_rv, v_ad, v_rd, v_tol, (p_result ->> 'passed')::boolean, c.claimed_by,
          c.pair, p_result ->> 'kind', p_result ->> 'outcome',
          (p_result -> 'detail') || jsonb_build_object('item_id', v_item, 'inputs_hash', coalesce(p_result -> 'inputs_hash', 'null'::jsonb)),
          c.cycle_id, c.issuer_id, c.market, c.attempts);
  return jsonb_build_object('reused', false, 'reconciliation_id', v_rid, 'item_id', v_item, 'quarantined', v_q, 'materialize', coalesce(v_mat, 'null'::jsonb));
end $$;
revoke execute on function public.apply_reconcile_result(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_reconcile_result(jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------- 14. atomic cycle creation (spec §3.1, §5.5; plan audit Q2)
-- The only writer of new dq_reconcile_cycles rows. Under the pair's cycle lock — the advisory lock
-- set_merge takes right before it registers a pending member (section 8a) — in one transaction:
--  a running cycle of the pair → returned unchanged (created false, nothing consumed);
--  else p_members [{issuer_id, market, expected_keys[]}] (distinct (issuer, market), keys resolved by the
--  runner) and p_pending [{issuer_id, market, source}] (the runner's snapshot; each entry's (issuer,
--  market) must be a member, i.e. its keys were resolved AFTER the merge was visible) are checked; the
--  cycle row (expected_total = Σ keys) and one pending cursor per member are inserted; exactly the
--  p_pending entries leave every cycle row's detail.pending_members (an entry registered after the
--  snapshot stays and joins the next cycle); the new row's detail records pending_merged_from /

async function readCursors(tables:TableClient,pair:CyclePairId,cycleId:string):Promise<Row[]>{
 const out:Row[]=[];
 for(const market of MARKETS)out.push(...await selectAll(tables,CURSOR_TABLE,{pair,cycle_id:cycleId,market},'issuer_id'));
 return out.sort((a,b)=>String(a.issuer_id)<String(b.issuer_id)?-1:String(a.issuer_id)>String(b.issuer_id)?1:String(a.market)<String(b.market)?-1:1);
}
async function ensureCursors(tables:TableClient,pair:CyclePairId,cycleId:string,members:FrozenMember[]):Promise<void>{
 const have=new Set((await readCursors(tables,pair,cycleId)).map(c=>mkey(String(c.issuer_id),String(c.market))));
 for(const m of members){
  if(have.has(mkey(m.issuer_id,m.market)))continue;
  try{
   await tables.insert(CURSOR_TABLE,{pair,cycle_id:cycleId,issuer_id:m.issuer_id,market:m.market,expected:m.expected_keys.length,state:'pending',claimed_by:null,claim_until:null,attempts:0,last_error:null,done_at:null,compared_passed:null,compared_failed:null,not_compared:null});
  }catch(e){if(!(e instanceof TableError&&e.code==='23505'))throw e;}
 }
}
function claimable(c:Row,now:Date):boolean{
 const until=c.claim_until===null||c.claim_until===undefined?null:Date.parse(String(c.claim_until));
 if(c.state==='pending')return true;
 if(c.state==='claimed')return until!==null&&until<now.getTime();
 if(c.state==='failed')return Number(c.attempts)<MAX_CURSOR_ATTEMPTS;
 return false;
}

async function targetOf(tables:TableClient,issuer:string):Promise<string>{
 const [r]=await tables.select('issuers',{issuer_id:issuer},{limit:1});
 return typeof r?.merged_into==='string'?r.merged_into:issuer;
}
/** Materializes each distinct target once and writes every listed item's hook; never throws. Returns the number of failed targets' items. */
async function observedHookAt(tables:TableClient,id:string):Promise<string|undefined>{
 try{const at=((((await tables.select('dq_quarantine',{id},{limit:1}))[0]?.detail??{}) as {hook?:{at?:unknown}}).hook?.at);return typeof at==='string'?at:undefined;}
 catch(e){console.error('[reconcile] hook observe',e instanceof Error?e.message:String(e));return undefined;}
}
async function runHooks(deps:ReconcileDeps,list:HookItem[],errors:BatchError[]):Promise<number>{
 const mat=deps.materialize??((db:FactsDb,issuer:string,market:Market)=>materializeFacts(db,issuer,market));
 let failed=0;
 const groups=new Map<string,{target:string;market:Market;items:{id:string;at:string|undefined}[]}>();
 for(const x of list){
  let target:string;
  try{target=await targetOf(deps.tables,x.issuerId);}
  catch(e){   // an unresolvable target fails only this item's hook; the next run's step 0 retries it
   const code=e instanceof Error?e.message.slice(0,100):'target_unresolved';
   errors.push({code:'materialize_error',key:mkey(x.issuerId,x.market),message:`target_unresolved:${code}`});failed++;
   if(x.itemId)await writeHookCas(deps.tables,x.itemId,{stage:'materialize',state:'failed',at:deps.now().toISOString(),message:'target_unresolved'},typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId));
   continue;
  }
  const k=mkey(target,x.market);
  const g=groups.get(k)??{target,market:x.market,items:[] as {id:string;at:string|undefined}[]};
  // the hook.at the item carries BEFORE we materialize: the done/failed write is compare-and-set on it (Task 14b review P1)
  if(x.itemId)g.items.push({id:x.itemId,at:typeof x.hookAt==='string'?x.hookAt:await observedHookAt(deps.tables,x.itemId)});groups.set(k,g);
 }
 for(const g of groups.values()){
  let hook:Hook;
  try{await mat(deps.db,g.target,g.market);hook={stage:'done',state:'done',at:deps.now().toISOString()};}
  catch(e){
   const code=e instanceof FactsDbError?e.code:'materialize_failed';
   hook={stage:'materialize',state:'failed',at:deps.now().toISOString(),message:code};
   errors.push({code:'materialize_error',key:mkey(g.target,g.market),message:code});failed+=g.items.length;
  }
  for(const it of g.items){
   const w=await writeHookCas(deps.tables,it.id,hook,it.at);
   if(w.result==='stale')errors.push({code:'skipped_summary',key:`${it.id}:hook_stale`});   // a newer pending hook committed meanwhile wins
  }
 }
 return failed;
}
async function retryPendingHooks(deps:ReconcileDeps,pair:CyclePairId,errors:BatchError[]):Promise<{retried:number;failed:number}>{
 const rows=(await selectAll(deps.tables,'dq_quarantine',{reason_code:'reconcile_mismatch',status:'open'},'id')).filter(r=>{
  const d=(r.detail??{}) as {pair?:unknown;hook?:{state?:unknown};issuer_id?:unknown;market?:unknown};
  return d.pair===pair&&(d.hook?.state==='pending'||d.hook?.state==='failed')&&typeof d.issuer_id==='string'&&(d.market==='US'||d.market==='CN');
 });
 if(rows.length===0)return {retried:0,failed:0};
 const failed=await runHooks(deps,rows.map(r=>{const d=r.detail as {issuer_id:string;market:Market};return {itemId:String(r.id),issuerId:d.issuer_id,market:d.market,hookAt:((r.detail as {hook?:{at?:unknown}}).hook?.at as string|undefined)??null};}),errors);
 return {retried:rows.length,failed};
}

/** Natural keys this member already committed in this cycle (any earlier attempt); final, never re-evaluated (spec T2; plan audit P5). */
async function acceptedKeys(tables:TableClient,fence:Fence):Promise<Set<string>>{
 const rows=await selectAll(tables,'dq_reconciliations',{pair:fence.pair,cycle_id:fence.cycle_id,issuer_id:fence.issuer_id,market:fence.market},'natural_key');
 return new Set(rows.map(r=>String(r.natural_key)));
}
function assertOnePerKey(plan:MemberPlan,results:ReconcileResultInput[]):void{
 if(results.length!==plan.expectedKeys.length||results.some((r,i)=>r.natural_key!==plan.expectedKeys[i].naturalKey))throw new ReconcileError('evaluate_contract');
}
function tally(r:ReconcileResultInput,out:ApplyReconcileOutcome,c:BatchCounts,outcomes:Map<string,number>):void{
 c.fetched++;
 if(out.reused){c.duplicates++;return;}
 if(r.outcome!=='compared'){c.failed++;outcomes.set(r.outcome,(outcomes.get(r.outcome)??0)+1);return;}
 if(r.passed){c.inserted++;return;}
 if(r.action==='record')c.failed++;else c.quarantined++;
}

async function processMember(deps:ReconcileDeps,pair:RegisteredPair,ctx:PairRunContext,fence:Fence,plan:MemberPlan,counts:BatchCounts,errors:BatchError[],outcomes:Map<string,number>):Promise<MemberReport>{
 const key=mkey(fence.issuer_id,fence.market);
 const report=(outcome:MemberOutcome,extra:{counts?:MemberCounts;code?:string}={}):MemberReport=>({issuerId:fence.issuer_id,market:fence.market,outcome,...extra});
 const hooks:HookItem[]=[];
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

codex
The changes correctly route unbound tag-fallback mismatches to review, stop retrying HTTP 429 responses, and attach size diagnostics to oversized-document results. No actionable regressions were identified in the diff or its downstream handling; tests were inspected but not executed.
The changes correctly route unbound tag-fallback mismatches to review, stop retrying HTTP 429 responses, and attach size diagnostics to oversized-document results. No actionable regressions were identified in the diff or its downstream handling; tests were inspected but not executed.

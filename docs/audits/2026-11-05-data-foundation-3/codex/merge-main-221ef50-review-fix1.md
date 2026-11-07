OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b3e1-873d-71b1-a121-55e5908a298b
--------
user
commit e809ef8
2026-11-07T02:41:06.181152Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer realm=\"OAuth\", resource_metadata=\"https://mcp.notion.com/.well-known/oauth-protected-resource/mcp\", scope=\"default\"" })
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat e809ef8; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 3302ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-SAG881n3' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-FQdeVQPp' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/merge-main-221ef50-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/merge-main-221ef50-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-XDvrtP3S' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-lOb3JbtG' (errno=Operation not permitted)
commit e809ef80f7bc5bc468f8d8176f66841aa6dacfcc
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 18:40:43 2026 -0800

    fix(industry): keep stock_basic listing evidence for existing securities as a backdate_window claim
    
    Both duplicate paths of applyAShareLoad (fast path and attachSecurity duplicate) dropped the
    stock_basic list_date for an existing security after the plan-3 adaptation; backfill-windows
    reads only stocks_universe, so a list_date only stock_basic knows was lost. When the row's
    valid_from is not that list_date as an evidenced listing date (method listing_date), file a
    claim/1 evidence_only claim (id_type ticker, suggested_op backdate_window) carrying the
    stock_basic page sha256 + snapshot locator (canonical-record sha256 fallback). fileClaim dedupes
    reruns onto the pending claim. No window or provenance writes.
    
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

 src/lib/industry/load-a-share.test.ts | 39 ++++++++++++++++++++++----
 src/lib/industry/load-a-share.ts      | 53 +++++++++++++++++++++++++++++------
 2 files changed, 78 insertions(+), 14 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../.. ../../../.. ../../../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show e809ef8 --; cat src/lib/industry/load-a-share.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
zsh:1: no matches found: ../../../../AGENTS*
zsh:1: no matches found: ../../../../../AGENTS*
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-T0WBr9kX' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-agIKIns0' (errno=Operation not permitted)
commit e809ef80f7bc5bc468f8d8176f66841aa6dacfcc
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 18:40:43 2026 -0800

    fix(industry): keep stock_basic listing evidence for existing securities as a backdate_window claim
    
    Both duplicate paths of applyAShareLoad (fast path and attachSecurity duplicate) dropped the
    stock_basic list_date for an existing security after the plan-3 adaptation; backfill-windows
    reads only stocks_universe, so a list_date only stock_basic knows was lost. When the row's
    valid_from is not that list_date as an evidenced listing date (method listing_date), file a
    claim/1 evidence_only claim (id_type ticker, suggested_op backdate_window) carrying the
    stock_basic page sha256 + snapshot locator (canonical-record sha256 fallback). fileClaim dedupes
    reruns onto the pending claim. No window or provenance writes.
    
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

diff --git a/src/lib/industry/load-a-share.test.ts b/src/lib/industry/load-a-share.test.ts
index b0ac62fe..d23c0b97 100644
--- a/src/lib/industry/load-a-share.test.ts
+++ b/src/lib/industry/load-a-share.test.ts
@@ -21,6 +21,8 @@ const noSleep=async()=>{};
 const tablesFor=()=>memoryTableClient({issuers:['issuer_id'],issuer_securities:['issuer_id','ticker','valid_from'],issuer_identifier_claims:['id'],ingest_batches:['batch_id'],dq_freshness:['dataset']});
 const sb=(over:Partial<StockBasicRow>):StockBasicRow=>({ts_code:'600519.SH',symbol:'600519',name:'贵州茅台',fullname:'贵州茅台酒股份有限公司',exchange:'SSE',list_status:'L',list_date:'20010827',delist_date:null,...over});
 const unusedManifests:ManifestStore={put:async()=>{throw new Error('unused');},get:async()=>{throw new Error('unused');},remove:async()=>{throw new Error('unused');}};
+const PAGE_SHA='d'.repeat(64);
+const PAGE_REFS=new Map([['600519.SH',{sha256:PAGE_SHA,locator:'disclosure-raw/tushare/x/'+PAGE_SHA+'.json'}]]);
 const opts=(over={})=>({batchId:BATCH,observedAt:NOW,lookupOrgId:lookup,sleep:noSleep,...over});
 
 describe('planAShareLoad',()=>{
@@ -138,8 +140,15 @@ describe('applyAShareLoad',()=>{
 describe('listing-date evidence, delisting and merged owners',()=>{
  const sec=(issuer:string,ticker:string,prov:Record<string,unknown>={})=>({issuer_id:issuer,ticker,isin:null,share_class:'A',is_primary:true,valid_from:'2026-01-05',valid_to:null,source:'seed',provenance:prov});
  // plan 3: issuer_securities.provenance is whitelisted (isin/figi/valid_from/valid_to/pending_change) and an evidenced
- // valid_from is written only by set_security_window (backfill-windows), so existing rows are left untouched here.
- it('fast path: an existing security is a duplicate and is not rewritten (valid_from and provenance untouched)',async()=>{
+ // valid_from is written only by set_security_window, so existing rows are never written here; the stock_basic
+ // list_date is retained as an evidence_only claim suggesting backdate_window (filed once, reruns dedupe onto it).
+ const backdateClaims=(t:ReturnType<typeof tablesFor>)=>t.rows('issuer_identifier_claims').map(c=>[c.issuer_id,c.id_type,c.value,c.op,c.status,c.source]);
+ const expectBackdateClaim=(t:ReturnType<typeof tablesFor>,evidence:Record<string,unknown>)=>{
+  expect(backdateClaims(t)).toEqual([['i-1','ticker','600519.SH','evidence_only','pending','tushare:stock_basic']]);
+  expect(t.rows('issuer_identifier_claims')[0].detail).toMatchObject({schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:'i-1'},
+   params:{suggested_op:'backdate_window',ticker:'600519.SH',valid_from:'2026-01-05',list_date:'2001-08-27',exchange:'SSE',list_status:'L'},evidence});
+ };
+ it('fast path: an existing security is a duplicate and is not rewritten; the list_date is kept as a backdate_window evidence claim',async()=>{
   const t=tablesFor();
   await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'茅台',cninfo_org_id:'gssz0600519',status:'active',provenance:{}});
   await t.insert('issuer_securities',sec('i-1','600519.SH',{keep:1}));
@@ -149,17 +158,35 @@ describe('listing-date evidence, delisting and merged owners',()=>{
   const row=t.rows('issuer_securities')[0];
   expect(row.valid_from).toBe('2026-01-05');
   expect(row.provenance).toEqual({keep:1});
-  const upd=vi.spyOn(t,'update');
+  expectBackdateClaim(t,{source:'tushare:stock_basic',as_of:TODAY,evidence_sha256:expect.stringMatching(/^[0-9a-f]{64}$/),locator:'stock_basic:600519.SH'});
+  const upd=vi.spyOn(t,'update');const ins=vi.spyOn(t,'insert');
   await applyAShareLoad(t,plan,opts({observedAt:'2026-11-07T22:30:00.000Z'}));
-  expect(upd).not.toHaveBeenCalled();
+  expect(upd).not.toHaveBeenCalled();expect(ins).not.toHaveBeenCalled();   // unchanged rerun: no row write, no second claim
+  expect(t.rows('issuer_identifier_claims')).toHaveLength(1);
+  expect((t.rows('issuer_identifier_claims')[0].detail as {sources:unknown[]}).sources).toHaveLength(0);
+  expect(t.rows('issuer_securities')).toEqual([sec('i-1','600519.SH',{keep:1})]);
  });
- it('attachSecurity duplicate (recheck path) leaves the existing row untouched',async()=>{
+ it('no claim when the row already carries the stock_basic list_date as its evidenced listing date',async()=>{
+  const t=tablesFor();
+  await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'茅台',cninfo_org_id:'gssz0600519',status:'active',provenance:{}});
+  await t.insert('issuer_securities',{...sec('i-1','600519.SH'),valid_from:'2001-08-27',valid_from_method:'listing_date'});
+  await applyAShareLoad(t,planAShareLoad([sb({})],UNIVERSE,TODAY),opts());
+  expect(t.rows('issuer_identifier_claims')).toEqual([]);
+ });
+ it('attachSecurity duplicate (recheck path) leaves the row untouched and keeps the page evidence in a backdate_window claim',async()=>{
   const t=tablesFor();
   await t.insert('issuers',{issuer_id:'i-1',canonical_name_zh:'茅台',cninfo_org_id:'gssz0600519',status:'active',provenance:{}});
   await t.insert('issuer_securities',sec('i-1','600519.SH'));
-  const r=await applyAShareLoad(t,planAShareLoad([sb({})],UNIVERSE,TODAY),opts({recheckOrgIds:true}));
+  const plan=planAShareLoad([sb({})],UNIVERSE,TODAY);
+  const r=await applyAShareLoad(t,plan,opts({recheckOrgIds:true,pageRefs:PAGE_REFS}));
   expect(r.counts).toMatchObject({duplicates:1,inserted:0});
   expect(t.rows('issuer_securities')).toEqual([sec('i-1','600519.SH')]);
+  expectBackdateClaim(t,{source:'tushare:stock_basic',as_of:TODAY,evidence_sha256:PAGE_SHA,locator:`disclosure-raw/tushare/x/${PAGE_SHA}.json`,note:'ts_code=600519.SH'});
+  const r2=await applyAShareLoad(t,plan,opts({recheckOrgIds:true,pageRefs:PAGE_REFS,observedAt:'2026-11-07T22:30:00.000Z'}));
+  expect(r2.counts).toMatchObject({duplicates:1,inserted:0});
+  expect(t.rows('issuer_identifier_claims')).toHaveLength(1);   // rerun: same pending claim, same page evidence not re-appended
+  expect((t.rows('issuer_identifier_claims')[0].detail as {sources:unknown[]}).sources).toHaveLength(0);
+  expect(t.rows('issuer_securities')).toEqual([sec('i-1','600519.SH')]);
  });
  it('a merged owner is not a fast-path duplicate: it goes through the full path and is skipped with a reason',async()=>{
   const t=tablesFor();lookup.mockClear();
diff --git a/src/lib/industry/load-a-share.ts b/src/lib/industry/load-a-share.ts
index 56704de1..d0998fda 100644
--- a/src/lib/industry/load-a-share.ts
+++ b/src/lib/industry/load-a-share.ts
@@ -12,7 +12,9 @@
 //     observed date, valid_from_method listing_date | first_observed, source 'tushare:stock_basic', provenance
 //     {valid_from: stock_basic row evidence}}) (plan 3: provenance passes the public whitelist, so the listing
 //     evidence lives under the valid_from key): 'duplicate' never backfills valid_from or rewrites provenance (spec 3
-//     backfill-windows owns that); 'conflict' (another issuer holds the ticker) → attach_security claim (claim/1,
+//     backfill-windows owns that) — instead, when stock_basic supplies a list_date the existing row does not carry as an
+//     evidenced valid_from (method ≠ listing_date or a different date), an evidence_only claim (suggested_op
+//     backdate_window, the admin amend path) keeps that evidence; fileClaim dedupes reruns onto the pending claim; 'conflict' (another issuer holds the ticker) → attach_security claim (claim/1,
 //     id_type ticker, source 'tushare:stock_basic') + skipped_summary(claim_pending). The issuer already holds another
 //     current A-share ticker (code change) → not attached, evidence_only claim (suggested_op attach_security) +
 //     skipped_summary(claim_pending).
@@ -80,7 +82,19 @@ export function planAShareLoad(rows:StockBasicRow[],universe:ReadonlySet<string>
  return plan;
 }
 
-export interface AShareApplyOptions{batchId:string;observedAt:string;lookupOrgId:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;maxLookups?:number;recheckOrgIds?:boolean}
+/** The stock_basic page that carried a ts_code: its response sha256 (raw_hash) and a locator (snapshot path when stored). */
+export interface StockBasicPageRef{sha256:string;locator:string}
+export interface AShareApplyOptions{batchId:string;observedAt:string;lookupOrgId:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;maxLookups?:number;recheckOrgIds?:boolean;pageRefs?:ReadonlyMap<string,StockBasicPageRef>}
+
+/** ts_code → the first page carrying it (pages in fetch order L, P, D). */
+export function stockBasicPageRefs(pages:readonly TusharePage<StockBasicRow>[]):Map<string,StockBasicPageRef>{
+ const out=new Map<string,StockBasicPageRef>();
+ for(const p of pages){
+  const locator=p.snapshot?`${p.snapshot.bucket}/${p.snapshot.path}`:`tushare:${p.api}:list_status=${String(p.params.list_status??'')}:offset=${p.offset}`;
+  for(const r of p.rows){const ts=(r.ts_code??'').trim().toUpperCase();if(ts&&!out.has(ts))out.set(ts,{sha256:p.raw_hash,locator});}
+ }
+ return out;
+}
 export interface AShareApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>;issuers:{created:number;backfilled:number};lookups:number}
 
 const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
@@ -88,7 +102,24 @@ const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
 const validFromEvidence=(c:AShareCandidate,asOf:string,observedAt:string)=>({valid_from:{source:STOCK_BASIC_SOURCE,as_of:asOf,observed_at:observedAt,
  row:{ts_code:c.ts_code,list_date:c.list_date,exchange:c.exchange,list_status:c.list_status}}});
 /** claim/1 evidence for a stock_basic candidate row / a cninfo lookup hit (sha256 over the canonical record). */
-const stockBasicEvidence=(c:AShareCandidate,observedAt:string):ClaimEvidence=>claimEvidence({source:STOCK_BASIC_SOURCE,asOf:observedAt,record:c,locator:`stock_basic:${c.ts_code}`});
+const stockBasicEvidence=(c:AShareCandidate,observedAt:string,ref?:StockBasicPageRef):ClaimEvidence=>ref&&/^[0-9a-f]{64}$/.test(ref.sha256)
+ ?{source:STOCK_BASIC_SOURCE,as_of:observedAt.slice(0,10),evidence_sha256:ref.sha256,locator:ref.locator,note:`ts_code=${c.ts_code}`}
+ :claimEvidence({source:STOCK_BASIC_SOURCE,asOf:observedAt,record:c,locator:`stock_basic:${c.ts_code}`});
+/**
+ * An existing security whose valid_from is not the stock_basic list_date as an evidenced listing date: files (or, on a
+ * rerun, appends to) an evidence_only claim suggesting backdate_window. Never writes the row (spec 3 owns windows).
+ */
+async function suggestBackdate(tables:TableClient,row:Row,c:AShareCandidate,observedAt:string,ref?:StockBasicPageRef):Promise<void>{
+ if(c.list_date===null)return;
+ const from=String(row.valid_from);
+ if(row.valid_from_method==='listing_date'&&from===c.list_date)return;
+ const issuerId=String(row.issuer_id);
+ await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'evidence_only',
+  detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
+   params:{suggested_op:'backdate_window',ticker:c.ts_code,valid_from:from,current_valid_from_method:row.valid_from_method??null,list_date:c.list_date,exchange:c.exchange,list_status:c.list_status,
+    note:c.list_date<from?'stock_basic list_date precedes valid_from':'stock_basic list_date differs from valid_from (not earlier: check the source)'},
+   evidence:stockBasicEvidence(c,observedAt,ref)})});
+}
 const cninfoEvidence=(symbol:string,hit:OrgLookup,observedAt:string):ClaimEvidence=>claimEvidence({source:CNINFO_SOURCE,asOf:observedAt,record:{symbol,...hit},locator:`topSearch:keyWord=${symbol}`});
 const isUniqueViolation=(e:unknown)=>e instanceof TableError&&e.code==='23505';
 
@@ -116,6 +147,7 @@ export async function applyAShareLoad(tables:TableClient,plan:AShareLoadPlan,opt
   try{
    const owner=await currentOwner(tables,c.ts_code,today);
    if(owner&&owner.issuer.status==='active'&&str(owner.issuer.cninfo_org_id)&&!opts.recheckOrgIds){   // fast path, no network
+    await suggestBackdate(tables,owner.security,c,opts.observedAt,opts.pageRefs?.get(c.ts_code));
     counts.duplicates++;continue;
    }
    if(lookups>=maxLookups){skips.push(`lookup_deferred:${c.ts_code}`);continue;}
@@ -165,17 +197,21 @@ export async function applyAShareLoad(tables:TableClient,plan:AShareLoadPlan,opt
    if(other){
     await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'evidence_only',
      detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
-      params:{suggested_op:'attach_security',note:`issuer holds current A-share ticker ${String(other.ticker)} (code change?)`},evidence:stockBasicEvidence(c,opts.observedAt)})});
+      params:{suggested_op:'attach_security',note:`issuer holds current A-share ticker ${String(other.ticker)} (code change?)`},evidence:stockBasicEvidence(c,opts.observedAt,opts.pageRefs?.get(c.ts_code))})});
     skips.push(`claim_pending:${c.ts_code}`);continue;
    }
    const res=await attachSecurity(tables,{issuer_id:issuerId,ticker:c.ts_code,share_class:'A',is_primary:true,valid_from:validFrom,valid_from_method:validFromMethod,
     source:STOCK_BASIC_SOURCE,provenance:validFromEvidence(c,today,opts.observedAt)});
    if(res==='inserted')counts.inserted++;
-   else if(res==='duplicate')counts.duplicates++;
+   else if(res==='duplicate'){
+    const mine=(await tables.select('issuer_securities',{issuer_id:issuerId,ticker:c.ts_code})).find(r=>isCurrentSecurity(r,today));
+    if(mine)await suggestBackdate(tables,mine,c,opts.observedAt,opts.pageRefs?.get(c.ts_code));
+    counts.duplicates++;
+   }
    else{
     await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'attach_security',
      detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
-      params:{share_class:'A',valid_from:validFrom,valid_from_method:validFromMethod,source:STOCK_BASIC_SOURCE,note:'ticker_held_by_other_issuer'},evidence:stockBasicEvidence(c,opts.observedAt)})});
+      params:{share_class:'A',valid_from:validFrom,valid_from_method:validFromMethod,source:STOCK_BASIC_SOURCE,note:'ticker_held_by_other_issuer'},evidence:stockBasicEvidence(c,opts.observedAt,opts.pageRefs?.get(c.ts_code))})});
     skips.push(`claim_pending:${c.ts_code}`);
    }
   }catch(e){counts.failed++;errors.push({code:'a_share_error',key:c.ts_code,message:errorMessage(e)});}
@@ -203,11 +239,12 @@ export async function runLoadAShare(deps:IndustryDeps,opts:RunLoadAShareOptions)
   await finishBatch(deps.tables,batchId!,{counts:{...emptyCounts(),fetched,failed:Math.max(1,candidates)},errors:[{code:e instanceof IndustryProviderError?e.code:'a_share_error',message:errorMessage(e)}]},deps.now());
   await recordAttempt(deps.tables,A_SHARE_DATASET,{ok:false,cadence:'daily',now:deps.now()});
  };
- let plan:AShareLoadPlan;let scan:DelistingScan={inputs:[],missing:[]};
+ let plan:AShareLoadPlan;let pageRefs=new Map<string,StockBasicPageRef>();let scan:DelistingScan={inputs:[],missing:[]};
  try{
   const pages:TusharePage<StockBasicRow>[]=[];
   for(const s of ['L','P','D'] as const)pages.push(...await fetchStockBasic(call,{listStatus:s},{sleep:opts.sleep,now:deps.now,snapshots:batchId?opts.snapshots:undefined}));
   scan=scanDelistings(pages);
+  pageRefs=stockBasicPageRefs(pages);
   plan=planAShareLoad(pages.flatMap(p=>p.rows),await aStockUniverse(deps.tables),today);
  }catch(e){
   if(batchId)await fail(e,0,0);
@@ -220,7 +257,7 @@ export async function runLoadAShare(deps:IndustryDeps,opts:RunLoadAShareOptions)
  await persistDelistings(deps,batchId,A_SHARE_DATASET,scan,delistErrors);
  let result:AShareApplyResult;
  try{
-  result=await applyAShareLoad(deps.tables,plan,{batchId,observedAt:now.toISOString(),lookupOrgId:opts.lookupOrgId??(symbol=>resolveOrgId(symbol,{fetch:deps.fetch})),sleep:opts.sleep,maxLookups:opts.maxLookups,recheckOrgIds:opts.recheckOrgIds});
+  result=await applyAShareLoad(deps.tables,plan,{batchId,observedAt:now.toISOString(),lookupOrgId:opts.lookupOrgId??(symbol=>resolveOrgId(symbol,{fetch:deps.fetch})),sleep:opts.sleep,maxLookups:opts.maxLookups,recheckOrgIds:opts.recheckOrgIds,pageRefs});
  }catch(e){
   await fail(e,plan.fetched,plan.candidates.length);
   throw e;
// src/lib/industry/load-a-share.ts
// A-share whole-universe issuer load (spec §4.7, V10 call signatures, V11 issuers_cninfo_idx). Does NOT use
// upsertIssuerByIdentifiers (it requires LEI/CIK/USCI). Per stock_basic row of the a_stock universe:
//  1. orgId = lookupOrgId(symbol) (巨潮 topSearch, landed collectors/cninfo.ts::resolveOrgId; paced here,
//     resolveOrgId itself does not pace); none → skipped_summary(no_org_id).
//  2. match: (a) issuers.cninfo_org_id = orgId; (b) the issuer owning the CURRENT issuer_securities row of
//     ts_code: null cninfo_org_id → backfilled (guarded update + provenance), a different one → no write,
//     correct_identifier claim (claim/1) on the issuer of that security + skipped_summary(org_id_mismatch); (c) new issuer
//     {canonical_name_zh: fullname ?? name, cninfo_org_id, status active}; a 23505 from issuers_cninfo_idx
//     (concurrent creator) → re-read and continue as (a).
//  3. attachSecurity(tables,{issuer_id, ticker: ts_code, share_class 'A', is_primary true, valid_from: list_date ??
//     observed date, valid_from_method listing_date | first_observed, source 'tushare:stock_basic', provenance
//     {valid_from: stock_basic row evidence}}) (plan 3: provenance passes the public whitelist, so the listing
//     evidence lives under the valid_from key): 'duplicate' never backfills valid_from or rewrites provenance (spec 3
//     backfill-windows owns that) — instead, when stock_basic supplies a list_date the existing row does not carry as an
//     evidenced valid_from (method ≠ listing_date or a different date), an evidence_only claim (suggested_op
//     backdate_window, the admin amend path) keeps that evidence; fileClaim dedupes reruns onto the pending claim; 'conflict' (another issuer holds the ticker) → attach_security claim (claim/1,
//     id_type ticker, source 'tushare:stock_basic') + skipped_summary(claim_pending). The issuer already holds another
//     current A-share ticker (code change) → not attached, evidence_only claim (suggested_op attach_security) +
//     skipped_summary(claim_pending).
//  4. list_status 'D' → skipped_summary(delisted) only (window closing is spec 3's valid_to_method='delisting'); the delist_date
//     is persisted in industry_security_delistings (delistings.ts: first evidence kept, a changed date updates + quarantines delist_date_changed).
//  5. receipt producer 'load-a-share', dataset 'issuers.a_stock', recordAttempt cadence daily (cron 30 22 * * *).
// Fast path: a ts_code whose current security row belongs to an issuer that already has a cninfo_org_id is a
// duplicate without a network lookup (re-checking orgIds is the job of a full run: opts.recheckOrgIds).
// Outcome per row: inserted (security attached), duplicates (already attached), skipped (reason, informational),
// failed (exception). Issuer creations/backfills are reported in `issuers` (not BatchCounts).
import {randomUUID} from 'node:crypto';
import {TableError,callRpc,selectAll} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import type {BatchCounts,BatchError,BatchStatus,TriggeredBy} from '../dq/batches';
import {emptyCounts,finishBatch,startBatch} from '../dq/batches';
import {recordAttempt} from '../dq/freshness';
import {buildClaimDetail,claimEvidence,fileClaim} from '../entities/claims';
import type {ClaimEvidence} from '../entities/types';
import {attachSecurity} from '../entities/securities';
import {isCurrentSecurity} from '../entities/resolve';
import {errorMessage,loaderOutcome,summarizeSkips,withSkippedSummary} from '../entities/load-sec';
import {resolveOrgId} from '../research/ingest/collectors/cninfo';
import type {OrgLookup} from '../research/ingest/collectors/cninfo';
import type {IndustryDeps} from './types';
import {persistDelistings,scanDelistings} from './delistings';
import type {DelistingScan} from './delistings';
import type {SnapshotCapture,StockBasicRow,TusharePage} from './providers/tushare-industry';
import {IndustryProviderError,defaultTushareCall,fetchStockBasic,ymdToIso} from './providers/tushare-industry';

export const A_SHARE_DATASET='issuers.a_stock';
export const A_SHARE_PRODUCER='load-a-share';
export const STOCK_BASIC_SOURCE='tushare:stock_basic';
export const CNINFO_SOURCE='cninfo:topSearch';
export const ORG_LOOKUP_INTERVAL_MS=500;
const TS_CODE=/^(\d{6})\.(SH|SZ|BJ)$/;
const B_SHARE=/^(900\d{3}\.SH|200\d{3}\.SZ)$/;
const CN_TICKER=/^\d{6}\.(SH|SZ|BJ)$/;

export interface AShareCandidate{ts_code:string;symbol:string;name_zh:string;list_date:string|null;exchange:string|null;list_status:string}
export interface AShareLoadPlan{observedDate:string;candidates:AShareCandidate[];skipped:string[];rejected:string[];fetched:number}

/** Pure: stock_basic rows (all list statuses) + the active a_stock universe → candidates, skips, rejects. */
export function planAShareLoad(rows:StockBasicRow[],universe:ReadonlySet<string>,observedDate:string):AShareLoadPlan{
 const plan:AShareLoadPlan={observedDate,candidates:[],skipped:[],rejected:[],fetched:rows.length};
 const seen=new Set<string>();
 for(const r of rows){
  const ts=(r.ts_code??'').trim().toUpperCase();
  const m=TS_CODE.exec(ts);
  if(!m){plan.rejected.push(`rejected_ts_code:${r.ts_code}`);continue;}
  if(seen.has(ts)){plan.skipped.push(`repeated_row:${ts}`);continue;}
  seen.add(ts);
  if(r.list_status==='D'){
   // delisted only with a delist_date; a 'D' row without one is anomalous evidence and is rejected, never attached as listed
   if(r.delist_date?.trim()){plan.skipped.push(`delisted:${ts}`);continue;}
   plan.rejected.push(`rejected_delist_date:${ts}`);continue;
  }
  if(B_SHARE.test(ts)){plan.skipped.push(`b_share:${ts}`);continue;}
  if(!universe.has(ts)){plan.skipped.push(`not_in_universe:${ts}`);continue;}
  const listDate=ymdToIso(r.list_date);
  if(listDate===undefined){plan.rejected.push(`rejected_list_date:${ts}`);continue;}
  const name=r.fullname?.trim()||r.name?.trim();
  if(!name){plan.rejected.push(`rejected_name:${ts}`);continue;}
  plan.candidates.push({ts_code:ts,symbol:r.symbol?.trim()||m[1],name_zh:name,list_date:listDate,exchange:r.exchange??null,list_status:r.list_status??'L'});
 }
 return plan;
}

/** The stock_basic page that carried a ts_code: its response sha256 (raw_hash) and a locator (snapshot path when stored). */
export interface StockBasicPageRef{sha256:string;locator:string}
export interface AShareApplyOptions{batchId:string;observedAt:string;lookupOrgId:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;maxLookups?:number;recheckOrgIds?:boolean;pageRefs?:ReadonlyMap<string,StockBasicPageRef>}

/** ts_code → the first page carrying it (pages in fetch order L, P, D). */
export function stockBasicPageRefs(pages:readonly TusharePage<StockBasicRow>[]):Map<string,StockBasicPageRef>{
 const out=new Map<string,StockBasicPageRef>();
 for(const p of pages){
  const locator=p.snapshot?`${p.snapshot.bucket}/${p.snapshot.path}`:`tushare:${p.api}:list_status=${String(p.params.list_status??'')}:offset=${p.offset}`;
  for(const r of p.rows){const ts=(r.ts_code??'').trim().toUpperCase();if(ts&&!out.has(ts))out.set(ts,{sha256:p.raw_hash,locator});}
 }
 return out;
}
export interface AShareApplyResult{counts:BatchCounts;errors:BatchError[];skippedSummary:Record<string,number>;rejectedSummary:Record<string,number>;issuers:{created:number;backfilled:number};lookups:number}

const str=(v:unknown)=>typeof v==='string'&&v.length>0?v:null;
/** Public-safe valid_from evidence of a newly attached row (plan 3 whitelist: the single provenance key valid_from). */
const validFromEvidence=(c:AShareCandidate,asOf:string,observedAt:string)=>({valid_from:{source:STOCK_BASIC_SOURCE,as_of:asOf,observed_at:observedAt,
 row:{ts_code:c.ts_code,list_date:c.list_date,exchange:c.exchange,list_status:c.list_status}}});
/** claim/1 evidence for a stock_basic candidate row / a cninfo lookup hit (sha256 over the canonical record). */
const stockBasicEvidence=(c:AShareCandidate,observedAt:string,ref?:StockBasicPageRef):ClaimEvidence=>ref&&/^[0-9a-f]{64}$/.test(ref.sha256)
 ?{source:STOCK_BASIC_SOURCE,as_of:observedAt.slice(0,10),evidence_sha256:ref.sha256,locator:ref.locator,note:`ts_code=${c.ts_code}`}
 :claimEvidence({source:STOCK_BASIC_SOURCE,asOf:observedAt,record:c,locator:`stock_basic:${c.ts_code}`});
/**
 * An existing security whose valid_from is not the stock_basic list_date as an evidenced listing date: files (or, on a
 * rerun, appends to) an evidence_only claim suggesting backdate_window. Never writes the row (spec 3 owns windows).
 */
async function suggestBackdate(tables:TableClient,row:Row,c:AShareCandidate,observedAt:string,ref?:StockBasicPageRef):Promise<void>{
 if(c.list_date===null)return;
 const from=String(row.valid_from);
 if(row.valid_from_method==='listing_date'&&from===c.list_date)return;
 const issuerId=String(row.issuer_id);
 await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'evidence_only',
  detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
   params:{suggested_op:'backdate_window',ticker:c.ts_code,valid_from:from,current_valid_from_method:row.valid_from_method??null,list_date:c.list_date,exchange:c.exchange,list_status:c.list_status,
    note:c.list_date<from?'stock_basic list_date precedes valid_from':'stock_basic list_date differs from valid_from (not earlier: check the source)'},
   evidence:stockBasicEvidence(c,observedAt,ref)})});
}
const cninfoEvidence=(symbol:string,hit:OrgLookup,observedAt:string):ClaimEvidence=>claimEvidence({source:CNINFO_SOURCE,asOf:observedAt,record:{symbol,...hit},locator:`topSearch:keyWord=${symbol}`});
const isUniqueViolation=(e:unknown)=>e instanceof TableError&&e.code==='23505';

async function issuerByOrgId(tables:TableClient,orgId:string):Promise<Row|null>{
 return (await tables.select('issuers',{cninfo_org_id:orgId},{limit:1}))[0]??null;
}
/** The issuer owning ts_code's current security row (landed validity predicate), with that row. */
async function currentOwner(tables:TableClient,ts:string,today:string):Promise<{issuer:Row;security:Row}|null>{
 const sec=(await tables.select('issuer_securities',{ticker:ts})).find(r=>isCurrentSecurity(r,today));
 if(!sec)return null;
 const issuer=(await tables.select('issuers',{issuer_id:String(sec.issuer_id)},{limit:1}))[0];
 return issuer?{issuer,security:sec}:null;
}

/** Writes the plan (spec §4.7 steps 1–4). The caller owns the batch. */
export async function applyAShareLoad(tables:TableClient,plan:AShareLoadPlan,opts:AShareApplyOptions):Promise<AShareApplyResult>{
 const counts=emptyCounts();counts.fetched=plan.fetched;
 const errors:BatchError[]=[];const skips=[...plan.skipped];
 const issuers={created:0,backfilled:0};
 const wait=opts.sleep??((ms:number)=>new Promise<void>(r=>setTimeout(r,ms)));
 const maxLookups=opts.maxLookups??Number.POSITIVE_INFINITY;
 const today=plan.observedDate;
 let lookups=0;
 for(const c of plan.candidates){
  try{
   const owner=await currentOwner(tables,c.ts_code,today);
   if(owner&&owner.issuer.status==='active'&&str(owner.issuer.cninfo_org_id)&&!opts.recheckOrgIds){   // fast path, no network
    await suggestBackdate(tables,owner.security,c,opts.observedAt,opts.pageRefs?.get(c.ts_code));
    counts.duplicates++;continue;
   }
   if(lookups>=maxLookups){skips.push(`lookup_deferred:${c.ts_code}`);continue;}
   if(lookups>0)await wait(ORG_LOOKUP_INTERVAL_MS);
   lookups++;
   const hit=await opts.lookupOrgId(c.symbol);
   if(!hit){skips.push(`no_org_id:${c.ts_code}`);continue;}
   const orgId=hit.orgId;
   // (a) / (b) / (c)
   let issuer=await issuerByOrgId(tables,orgId);
   if(!issuer&&owner){
    const stored=str(owner.issuer.cninfo_org_id);
    if(stored&&stored!==orgId){
     const id=String(owner.issuer.issuer_id);
     await fileClaim(tables,{issuer_id:id,id_type:'cninfo_org_id',value:orgId,source:CNINFO_SOURCE,op:'correct_identifier',
      detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:id},params:{expected_current:stored,new_value:orgId},evidence:cninfoEvidence(c.symbol,hit,opts.observedAt)})});
     skips.push(`org_id_mismatch:${c.ts_code}`);continue;
    }
    // backfill a null cninfo_org_id through the guarded plan-3 writer (one locked UPDATE, provenance key merged);
    // a lost race (row changed or orgId taken: 'conflict') re-reads by orgId
    const id=String(owner.issuer.issuer_id);
    const out=await callRpc(tables,'set_issuer_identifier',{p_issuer:id,p_column:'cninfo_org_id',p_value:orgId,p_provenance:{source:CNINFO_SOURCE,observed_at:opts.observedAt}});
    if(out==='written'){issuers.backfilled++;issuer={...owner.issuer,cninfo_org_id:orgId};}
    else{
     issuer=await issuerByOrgId(tables,orgId);
     if(!issuer){skips.push(`issuer_not_active:${c.ts_code}`);continue;}
    }
   }
   if(!issuer){
    const now=opts.observedAt;
    const row:Row={issuer_id:randomUUID(),canonical_name_zh:c.name_zh,canonical_name_en:null,country_code:null,lei:null,cik:null,usci:null,cninfo_org_id:orgId,
     hkex_stock_code_primary:null,status:'active',merged_into:null,created_at:now,updated_at:now,
     provenance:{cninfo_org_id:{source:CNINFO_SOURCE,observed_at:now},canonical_name_zh:{source:STOCK_BASIC_SOURCE,observed_at:now}}};
    try{await tables.insert('issuers',row);issuer=row;issuers.created++;}
    catch(e){
     if(!isUniqueViolation(e))throw e;
     issuer=await issuerByOrgId(tables,orgId);   // issuers_cninfo_idx: a concurrent creator won → continue as (a)
     if(!issuer)throw e;
    }
   }
   const issuerId=String(issuer.issuer_id);
   if(issuer.status!=='active'){skips.push(`issuer_not_active:${c.ts_code}`);continue;}
   // code change: the issuer already has another current A-share ticker → never auto-attach a second one
   const other=(await tables.select('issuer_securities',{issuer_id:issuerId})).find(r=>isCurrentSecurity(r,today)&&CN_TICKER.test(String(r.ticker))&&!B_SHARE.test(String(r.ticker))&&String(r.ticker)!==c.ts_code);
   const validFrom=c.list_date??today;
   const validFromMethod=c.list_date?'listing_date':'first_observed';
   if(other){
    await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'evidence_only',
     detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
      params:{suggested_op:'attach_security',note:`issuer holds current A-share ticker ${String(other.ticker)} (code change?)`},evidence:stockBasicEvidence(c,opts.observedAt,opts.pageRefs?.get(c.ts_code))})});
    skips.push(`claim_pending:${c.ts_code}`);continue;
   }
   const res=await attachSecurity(tables,{issuer_id:issuerId,ticker:c.ts_code,share_class:'A',is_primary:true,valid_from:validFrom,valid_from_method:validFromMethod,
    source:STOCK_BASIC_SOURCE,provenance:validFromEvidence(c,today,opts.observedAt)});
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate'){
    const mine=(await tables.select('issuer_securities',{issuer_id:issuerId,ticker:c.ts_code})).find(r=>isCurrentSecurity(r,today));
    if(mine)await suggestBackdate(tables,mine,c,opts.observedAt,opts.pageRefs?.get(c.ts_code));
    counts.duplicates++;
   }
   else{
    await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'attach_security',
     detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
      params:{share_class:'A',valid_from:validFrom,valid_from_method:validFromMethod,source:STOCK_BASIC_SOURCE,note:'ticker_held_by_other_issuer'},evidence:stockBasicEvidence(c,opts.observedAt,opts.pageRefs?.get(c.ts_code))})});
    skips.push(`claim_pending:${c.ts_code}`);
   }
  }catch(e){counts.failed++;errors.push({code:'a_share_error',key:c.ts_code,message:errorMessage(e)});}
 }
 const skippedSummary=summarizeSkips(skips);
 const rejectedSummary=summarizeSkips(plan.rejected);
 return {counts,errors:withSkippedSummary(errors,skippedSummary,rejectedSummary),skippedSummary,rejectedSummary,issuers,lookups};
}

export interface RunLoadAShareOptions{apply:boolean;triggeredBy?:TriggeredBy;today?:string;maxLookups?:number;recheckOrgIds?:boolean;lookupOrgId?:(symbol:string)=>Promise<OrgLookup|null>;sleep?:(ms:number)=>Promise<void>;snapshots?:SnapshotCapture}
export interface RunLoadAShareResult{status:BatchStatus|'dry_run';batchId:string|null;plan:{candidates:number;skipped:Record<string,number>;rejected:Record<string,number>};apply:AShareApplyResult|null;exitCode:0|1}

/** Reads the active a_stock universe (security_universe_memberships; PK (ticker, universe) → ticker unique within it). */
export async function aStockUniverse(tables:TableClient):Promise<Set<string>>{
 return new Set((await selectAll(tables,'security_universe_memberships',{universe:'a_stock',is_active:true},'ticker')).map(r=>String(r.ticker).trim().toUpperCase()));
}

/** Job entry (cron / script): stock_basic L, P and D passes → plan → (apply) → receipt + freshness. Apply mode opens the batch BEFORE fetching, so a failed fetch or plan is receipted (failed + ok:false attempt); a dry run writes nothing. */
export async function runLoadAShare(deps:IndustryDeps,opts:RunLoadAShareOptions):Promise<RunLoadAShareResult>{
 if(opts.apply&&!deps.codeVersion)throw new Error('code_version_missing');
 const call=deps.tushare??defaultTushareCall({fetch:deps.fetch});
 const now=deps.now();const today=opts.today??now.toISOString().slice(0,10);
 const batchId=opts.apply?(await startBatch(deps.tables,{producer:A_SHARE_PRODUCER,dataset:A_SHARE_DATASET,codeVersion:deps.codeVersion!,triggeredBy:opts.triggeredBy??'script'})).batchId:null;
 const fail=async(e:unknown,fetched:number,candidates:number)=>{
  await finishBatch(deps.tables,batchId!,{counts:{...emptyCounts(),fetched,failed:Math.max(1,candidates)},errors:[{code:e instanceof IndustryProviderError?e.code:'a_share_error',message:errorMessage(e)}]},deps.now());
  await recordAttempt(deps.tables,A_SHARE_DATASET,{ok:false,cadence:'daily',now:deps.now()});
 };
 let plan:AShareLoadPlan;let pageRefs=new Map<string,StockBasicPageRef>();let scan:DelistingScan={inputs:[],missing:[]};
 try{
  const pages:TusharePage<StockBasicRow>[]=[];
  for(const s of ['L','P','D'] as const)pages.push(...await fetchStockBasic(call,{listStatus:s},{sleep:opts.sleep,now:deps.now,snapshots:batchId?opts.snapshots:undefined}));
  scan=scanDelistings(pages);
  pageRefs=stockBasicPageRefs(pages);
  plan=planAShareLoad(pages.flatMap(p=>p.rows),await aStockUniverse(deps.tables),today);
 }catch(e){
  if(batchId)await fail(e,0,0);
  throw e;
 }
 const planSummary={candidates:plan.candidates.length,skipped:summarizeSkips(plan.skipped),rejected:summarizeSkips(plan.rejected)};
 if(!batchId)return {status:'dry_run',batchId:null,plan:planSummary,apply:null,exitCode:0};
 // K4: the delisting dates (stock_basic 'D' pass) are persisted with their page evidence; failures and changed dates become batch errors
 const delistErrors:BatchError[]=[];
 await persistDelistings(deps,batchId,A_SHARE_DATASET,scan,delistErrors);
 let result:AShareApplyResult;
 try{
  result=await applyAShareLoad(deps.tables,plan,{batchId,observedAt:now.toISOString(),lookupOrgId:opts.lookupOrgId??(symbol=>resolveOrgId(symbol,{fetch:deps.fetch})),sleep:opts.sleep,maxLookups:opts.maxLookups,recheckOrgIds:opts.recheckOrgIds,pageRefs});
 }catch(e){
  await fail(e,plan.fetched,plan.candidates.length);
  throw e;
 }
 result.errors.push(...delistErrors);
 const status=await finishBatch(deps.tables,batchId,{counts:result.counts,errors:result.errors},deps.now());
 const outcome=loaderOutcome(status,result.counts,result.rejectedSummary);
 await recordAttempt(deps.tables,A_SHARE_DATASET,{ok:outcome.ok,cadence:'daily',now:deps.now(),detail:{issuers:result.issuers,lookups:result.lookups}});
 return {status,batchId,plan:planSummary,apply:result,exitCode:outcome.exitCode};
}

exec
/bin/zsh -lc "cat ../../../AGENTS.md; find . -name AGENTS.md -o -name AGENTS.override.md; cat src/lib/entities/claims.ts; rg -n 'backdate_window' src/lib/entities; cat src/lib/entities/securities.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 80ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>// src/lib/entities/claims.ts
// Pending issuer_identifier_claims in the claim/1 shape (spec 3 §4.2.1; plan 3 contract C2): the review
// queue for identifier and window changes that contradict stored data or need a human decision.
// validateClaimDetail mirrors the SQL check identifier_claim_problem that resolve_identifier_claim
// runs again on acceptance: keep the two in step (migration 20261107090000). A claim is keyed by
// (issuer_id, id_type, value, op, target_key) while pending (partial unique index); filing the same key
// again only appends new evidence to detail.sources and never changes target or params.
import {createHash,randomUUID} from 'node:crypto';
import {TableError,callRpc} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';
import {ProvenanceError,sanitizeProvenance} from './provenance';
import type {ClaimDetail,ClaimEvidence,ClaimIdType,ClaimOp,ClaimTarget,EvidenceKind} from './types';

/** Unique (23505) or exclusion (23P01) violation, i.e. another row already holds the key. */
export const isUnique=(e:unknown)=>e instanceof TableError&&(e.code==='23505'||e.code==='23P01');

export interface ClaimInput{issuer_id:string;id_type:ClaimIdType;value:string;source:string;op:Exclude<ClaimOp,'legacy'>;detail:ClaimDetail}
export const CLAIM_SCHEMA='claim/1';
export const EVIDENCE_KINDS:readonly EvidenceKind[]=['hard_identifier','official_list','name_match','filing_form','provider_mapping'];
const ISSUER_COLUMNS:readonly string[]=['lei','cik','usci','cninfo_org_id'];
const SECURITY_COLUMNS:readonly string[]=['isin','figi'];
const SHARE_CLASSES:readonly string[]=['A','H','ADR','common','preferred','other','unknown'];
const FROM_METHODS:readonly string[]=['first_observed','listing_date','ticker_change','curated'];
const TO_METHODS:readonly string[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];
const BACKDATE_METHODS:readonly string[]=['listing_date','ticker_change','curated'];
const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
const ISIN=/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const TICKER=/^[A-Z0-9][A-Z0-9.-]{0,31}$/;
const SHA256=/^[0-9a-f]{64}$/;

const isObj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max=64):v is string=>typeof v==='string'&&v.length>=1&&v.length<=max;
const onlyKeys=(o:Record<string,unknown>,allowed:readonly string[])=>Object.keys(o).every(k=>allowed.includes(k));

/** A real calendar day as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDate(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const d=new Date(`${v}T00:00:00Z`);
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;
}
const validEvidence=(e:unknown):e is ClaimEvidence=>isObj(e)&&str(e.source)&&isIsoDate(e.as_of)&&typeof e.evidence_sha256==='string'&&SHA256.test(e.evidence_sha256 as string)
 &&(e.locator===undefined||typeof e.locator==='string')&&(e.note===undefined||typeof e.note==='string');

/** op ':' issuer_id, or op ':' issuer_id '|' ticker '|' valid_from (= SQL identifier_claim_target_key). */
export function claimTargetKey(op:ClaimOp,target:ClaimTarget):string{
 return target.ticker!==undefined?`${op}:${target.issuer_id}|${target.ticker}|${target.valid_from}`:`${op}:${target.issuer_id}`;
}

/** Provenance keys an accepted claim may write to its target row (detail.provenance_written). */
export function provenanceKeysFor(op:ClaimOp,idType:ClaimIdType):readonly string[]{
 if(op==='set_identifier'||op==='correct_identifier')return [idType];
 if(op==='attach_security')return ['isin','figi','valid_from'];
 if(op==='close_security')return ['valid_to'];
 if(op==='backdate_window')return ['valid_from'];
 return [];
}

type Verdict={ok:true}|{ok:false;error:string};
const bad=(field:string):Verdict=>({ok:false,error:`invalid_claim:${field}`});

/**
 * claim/1 check for (op, id_type, detail) per spec 3 §4.2.1; with `value`, also that the claim's value
 * column agrees (correct_identifier new_value, close/backdate target.ticker). Unknown top-level detail
 * keys are allowed (amend bookkeeping); unknown params keys are not, except for evidence_only.
 */
export function validateClaimDetail(op:ClaimOp,idType:ClaimIdType,detail:unknown,value?:string):Verdict{
 if(op==='legacy')return {ok:false,error:'legacy_claim'};
 if(!isObj(detail)||detail.schema!==CLAIM_SCHEMA)return bad('schema');
 if(!EVIDENCE_KINDS.includes(detail.evidence_kind as EvidenceKind))return bad('evidence_kind');
 const t=detail.target,pa=detail.params;
 if(!isObj(t)||!str(t.issuer_id))return bad('target.issuer_id');
 if(!isObj(pa))return bad('params');
 if(!validEvidence(detail.evidence))return bad('evidence');
 if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
 if(detail.provenance_written!==undefined&&!isObj(detail.provenance_written))return bad('provenance_written');
 const full='ticker' in t||'valid_from' in t;
 if(full){if(!str(t.ticker,32)||!isIsoDate(t.valid_from)||Object.keys(t).length!==3)return bad('target');}
 else if(Object.keys(t).length!==1)return bad('target');
 switch(op){
  case 'set_identifier':
  case 'correct_identifier':
   if(ISSUER_COLUMNS.includes(idType)){if(full)return bad('target');}
   else if(SECURITY_COLUMNS.includes(idType)){if(!full)return bad('target');}
   else return bad('op_id_type');
   if(op==='set_identifier'){
    if(!onlyKeys(pa,['candidates','note'])||(pa.candidates!==undefined&&!Array.isArray(pa.candidates))||(pa.note!==undefined&&typeof pa.note!=='string'))return bad('params');
   }else{
    if(!onlyKeys(pa,['expected_current','new_value','candidates','note'])||!str(pa.expected_current)||!str(pa.new_value)||pa.expected_current===pa.new_value)return bad('params');
    if(value!==undefined&&pa.new_value!==value)return bad('params.new_value');
   }
   break;
  case 'attach_security':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if(!onlyKeys(pa,['share_class','valid_from','valid_from_method','source','isin','note','ticker'])||(pa.ticker!==undefined&&!(typeof pa.ticker==='string'&&TICKER.test(pa.ticker)))||!SHARE_CLASSES.includes(pa.share_class as string)
    ||!isIsoDate(pa.valid_from)||!FROM_METHODS.includes(pa.valid_from_method as string)||!str(pa.source)
    ||(pa.isin!==undefined&&pa.isin!==null&&!(typeof pa.isin==='string'&&ISIN.test(pa.isin as string))))return bad('params');
   // the inserted ticker is params.ticker, else the claim value (SQL: params.ticker)
   if(pa.ticker===undefined&&value!==undefined&&!TICKER.test(value))return bad('params.ticker');
   break;
  case 'close_security':
  case 'backdate_window':
   if(idType!=='ticker'||!full)return bad('op_id_type');
   if(value!==undefined&&t.ticker!==value)return bad('target.ticker');
   if(op==='close_security'){
    if(!onlyKeys(pa,['valid_to','valid_to_method','note'])||!isIsoDate(pa.valid_to)||!TO_METHODS.includes(pa.valid_to_method as string)||(pa.valid_to as string)<=(t.valid_from as string))return bad('params');
   }else if(!onlyKeys(pa,['new_valid_from','valid_from_method','note'])||!isIsoDate(pa.new_valid_from)||!BACKDATE_METHODS.includes(pa.valid_from_method as string)||(pa.new_valid_from as string)>=(t.valid_from as string))return bad('params');
   break;
  case 'evidence_only':
   if(idType!=='ticker'||full)return bad('op_id_type');
   if('suggested_op' in pa&&!(typeof pa.suggested_op==='string'&&SUGGESTED_OPS.includes(pa.suggested_op)))return bad('params.suggested_op');
   break;
  default:
   return bad('op');
 }
 if(detail.provenance_written!==undefined){
  try{sanitizeProvenance(detail.provenance_written,provenanceKeysFor(op,idType));}
  catch(e){if(e instanceof ProvenanceError)return bad(`provenance_written:${e.code}`);throw e;}
  // SQL: it must carry the op's own provenance key (the one resolve_identifier_claim merges)
  const own=op==='close_security'?'valid_to':op==='set_identifier'||op==='correct_identifier'?idType:'valid_from';
  if(provenanceKeysFor(op,idType).length>0&&!(own in detail.provenance_written))return bad('provenance_written');
 }
 return {ok:true};
}

/** Canonical JSON (keys sorted at every level, undefined dropped): the bytes whose sha256 names a record. */
export function canonicalJson(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonicalJson).join(',')}]`;
 if(isObj(v))return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(',')}}`;
 return JSON.stringify(v??null);
}

/** Evidence for a claim derived from an input record: sha256 over its canonical JSON; as_of is the record's date (first 10 chars) or today (UTC). */
export function claimEvidence(input:{source:string;asOf?:unknown;record:unknown;locator?:string;note?:string}):ClaimEvidence{
 const day=typeof input.asOf==='string'?input.asOf.slice(0,10):'';
 return {
  source:input.source,as_of:isIsoDate(day)?day:new Date().toISOString().slice(0,10),
  evidence_sha256:createHash('sha256').update(canonicalJson(input.record)).digest('hex'),
  ...(input.locator?{locator:input.locator}:{}),...(input.note?{note:input.note}:{}),
 };
}

export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
 return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
  ...(input.provenance_written?{provenance_written:input.provenance_written}:{})};
}

/**
 * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
 * pending claim matching `key` through the row-locking SQL function append_claim_evidence (migration
 * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
 * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
 * params / the first evidence are never touched. 'not_found' = the claim was resolved meanwhile.
 * Needs client.rpc (callRpc: rpc_unavailable otherwise).
 */
async function appendEvidence(client:TableClient,key:Row,detail:ClaimDetail):Promise<'ok'|'not_found'>{
 for(const evidence of [detail.evidence,...(detail.sources??[])]){
  const r=await callRpc(client,'append_claim_evidence',{p_issuer:key.issuer_id,p_id_type:key.id_type,p_value:key.value,p_op:key.op,p_target_key:key.target_key,p_evidence:evidence});
  if(r==='not_found')return 'not_found';
 }
 return 'ok';
}

/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
function dedupeSources(detail:ClaimDetail):ClaimEvidence[]{
 const seen=new Set([`${detail.evidence.source}\u0000${detail.evidence.evidence_sha256}`]);
 return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
}

/**
 * Files a pending claim/1 claim. Validates first (throws invalid_claim:<field> / legacy_claim, no DB
 * access). The same pending (issuer_id, id_type, value, op, target_key) → every incoming evidence item
 * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
 * unique index) is treated the same way. If the pending claim was resolved between the lookup and the
 * append ('not_found'), the whole step is retried once against the current state (a new pending claim
 * is inserted when none is pending); when that still persists nothing the call throws
 * claim_not_persisted (retryable) — it never returns false without having persisted the evidence.
 * Returns whether a new claim row was written.
 */
export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
 const v=validateClaimDetail(c.op,c.id_type,c.detail,c.value);
 if(!v.ok)throw new Error(v.error);
 if(c.detail.target.issuer_id!==c.issuer_id)throw new Error('invalid_claim:target.issuer_id');
 if(!str(c.source))throw new Error('invalid_claim:source');
 if(!str(c.value))throw new Error('invalid_claim:value');
 const target_key=claimTargetKey(c.op,c.detail.target);
 const key:Row={issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,op:c.op,target_key,status:'pending'};
 for(let attempt=0;attempt<2;attempt++){
  if((await client.select('issuer_identifier_claims',key,{limit:1})).length){
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
   continue;
  }
  try{
   await client.insert('issuer_identifier_claims',{
    id:randomUUID(),issuer_id:c.issuer_id,id_type:c.id_type,value:c.value,source:c.source,confidence:null,status:'pending',
    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
   });
   return true;
  }catch(e){
   if(!isUnique(e))throw e;
   if(await appendEvidence(client,key,c.detail)==='ok')return false;
  }
 }
 throw new Error('claim_not_persisted');
}
src/lib/entities/claims.test.ts:36:   ['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'ticker_change'}})],
src/lib/entities/claims.test.ts:37:   ['evidence_only','ticker',d({evidence_kind:'filing_form',params:{suggested_op:'backdate_window',accession:'0001234567-26-000001',form:'8-A12B'}})],
src/lib/entities/claims.test.ts:64:   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-09-01',valid_from_method:'listing_date'}})],'invalid_claim:params'],
src/lib/entities/claims.test.ts:65:   [['backdate_window','ticker',d({target:rowT,params:{new_valid_from:'2001-08-01',valid_from_method:'first_observed'}})],'invalid_claim:params'],
src/lib/entities/claims.test.ts:83:  expect(provenanceKeysFor('backdate_window','ticker')).toEqual(['valid_from']);
src/lib/entities/types.ts:9:export type ClaimOp='legacy'|'evidence_only'|'set_identifier'|'correct_identifier'|'attach_security'|'close_security'|'backdate_window';
src/lib/entities/claims.ts:26:const SUGGESTED_OPS:readonly string[]=['attach_security','close_security','backdate_window'];
src/lib/entities/claims.ts:54: if(op==='backdate_window')return ['valid_from'];
src/lib/entities/claims.ts:101:  case 'backdate_window':
src/lib/entities/load-sec-ticker-change.test.ts:78:  expect((claims[0].detail as {params:Record<string,unknown>;target:unknown}).params).toMatchObject({suggested_op:'backdate_window',old_ticker:'OLD',replacement_tickers:['NEW'],first_missing_as_of:T1});
src/lib/entities/load-sec.ts:285:  params:{suggested_op:'backdate_window',old_ticker:e.ticker,cik:e.cik,replacement_tickers:e.replacement,first_missing_as_of:e.firstMissingAsOf,...(e.submissionsSha256?{submissions_sha256:e.submissionsSha256}:{}),note},
src/lib/entities/identifiers/sec-submissions.test.ts:162:  expect(claims[1].detail.params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
src/lib/entities/ah-link.integration.test.ts:186: it('an evidence_only claim is accepted only with an amend; the amended backdate_window moves valid_from',async()=>{
src/lib/entities/ah-link.integration.test.ts:191:   schema:'claim/1',evidence_kind:'filing_form',target:{issuer_id:e},params:{suggested_op:'backdate_window',accession:'0000999001-01-000001',form:'8-A12B',filing_date:'2019-05-20',note:evidence.note},evidence,sources:[evidence],
src/lib/entities/ah-link.integration.test.ts:195:  const amend={op:'backdate_window',target:{issuer_id:e,ticker:aTicker,valid_from:'2020-01-01'},params:{new_valid_from:'2019-06-03',valid_from_method:'listing_date'}};
src/lib/entities/ah-link.integration.test.ts:196:  expect((await resolve(claim.id,'accepted',amend)).rows[0].r).toMatchObject({op:'backdate_window',applied:true,amended:true});
src/lib/entities/ah-link.integration.test.ts:201:  expect(after.detail.original_params).toMatchObject({suggested_op:'backdate_window',form:'8-A12B'});
src/lib/entities/identifiers/sec-submissions.ts:193:export const EVIDENCE_FORMS:Readonly<Record<string,{suggested_op:'backdate_window'|'close_security';note:string}>>={
src/lib/entities/identifiers/sec-submissions.ts:194: '8-A12B':{suggested_op:'backdate_window',note:'12(b) 交易所注册；所指证券类别与生效日须核对原文'},
src/lib/entities/identifiers/sec-submissions.ts:195: '8-A12G':{suggested_op:'backdate_window',note:'12(g) 注册，非交易所上市'},
src/lib/entities/identifiers.integration.test.ts:622: it('backdate_window moves valid_from under the old-value guard; an overlap is ownership_conflict',async()=>{
src/lib/entities/identifiers.integration.test.ts:627:  const ok=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2006-03-01',valid_from_method:'listing_date'}});
src/lib/entities/identifiers.integration.test.ts:628:  expect(await resolve(ok,'accepted')).toEqual({op:'backdate_window',applied:true,amended:false});
src/lib/entities/identifiers.integration.test.ts:631:  const stale=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target,params:{new_valid_from:'2007-01-01',valid_from_method:'curated'}});
src/lib/entities/identifiers.integration.test.ts:634:  const over=await newClaim({issuer:a,id_type:'ticker',value:t,op:'backdate_window',target:{issuer_id:a,ticker:t,valid_from:'2006-03-01'},params:{new_valid_from:'2004-01-01',valid_from_method:'curated'}});
src/lib/entities/identifiers.integration.test.ts:1221: it('claim attach_security / backdate_window and set_security_window on one ticker serialise on the per-ticker advisory lock (issuer -> row -> advisory)',async()=>{
src/lib/entities/identifiers.integration.test.ts:1238:  const bd=await newClaim({issuer:d,id_type:'ticker',value:t2,op:'backdate_window',target:{issuer_id:d,ticker:t2,valid_from:'1990-01-01'},params:{new_valid_from:'1980-01-01',valid_from_method:'curated'}});
// src/lib/entities/securities.ts
// Ticker ownership over time. The DB enforces one open owner per ticker and no overlapping
// half-open [valid_from, valid_to) windows; this module classifies an incoming window against the
// rows it overlaps and turns those violations into 'duplicate' / 'conflict' outcomes.
// Plan 3 (spec 3 §3.1, §4.2.1; contract C2): every inserted row carries valid_from_method /
// valid_to_method (defaults: curated source → 'curated', else 'first_observed'; a closed window must
// name its method), provenance passes the public whitelist (sanitizeProvenance) before any DB access,
// and an ISIN contradiction becomes a claim/1 claim when the caller supplies claimEvidence: a row of
// this issuer → set_identifier / correct_identifier on that row; another holder (open incoming window
// only) → attach_security for the incoming security. Closed-history conflicts are only reported.
import type {Row,TableClient} from '../db/table-client';
import {buildClaimDetail,fileClaim,isUnique} from './claims';
import {isBlank,normalizeIsin,normalizeTicker} from './normalize';
import {sanitizeProvenance} from './provenance';
import type {IssuerSecurityInput,ValidFromMethod,ValidToMethod} from './types';

export type AttachResult='inserted'|'duplicate'|'conflict';
export const VALID_FROM_METHODS:readonly ValidFromMethod[]=['first_observed','listing_date','ticker_change','curated'];
export const VALID_TO_METHODS:readonly ValidToMethod[]=['delisting','ticker_change','sec_file_absent','curated','merge_close','unrecorded'];

type Window={valid_from:string;valid_to:string|null};
const str=(v:unknown)=>v==null?null:String(v);
/** Half-open overlap with null valid_to = +∞. Dates are ISO 'YYYY-MM-DD', so text order is date order. */
const overlaps=(r:Row,w:Window)=>{
 const from=String(r.valid_from),to=str(r.valid_to);
 return (w.valid_to===null||from<w.valid_to)&&(to===null||w.valid_from<to);
};

/** Window-end methods for an incoming row; throws invalid_security:<field> on a missing or unknown method. */
export function securityMethods(raw:Pick<IssuerSecurityInput,'source'|'valid_from_method'|'valid_to_method'>,validTo:string|null):{valid_from_method:ValidFromMethod;valid_to_method:ValidToMethod|null}{
 const from=raw.valid_from_method??(raw.source==='curated'?'curated':'first_observed');
 if(!VALID_FROM_METHODS.includes(from))throw new Error('invalid_security:valid_from_method');
 const to=raw.valid_to_method??null;
 if(validTo===null){
  if(to!==null)throw new Error('invalid_security:valid_to_method');
  return {valid_from_method:from,valid_to_method:null};
 }
 if(to===null||!VALID_TO_METHODS.includes(to))throw new Error('invalid_security:valid_to_method');
 return {valid_from_method:from,valid_to_method:to};
}

export async function attachSecurity(client:TableClient,raw:IssuerSecurityInput):Promise<AttachResult>{
 const sec={...raw,ticker:normalizeTicker(raw.ticker),isin:normalizeIsin(raw.isin),valid_to:isBlank(raw.valid_to)?null:String(raw.valid_to)};
 const methods=securityMethods(raw,sec.valid_to);
 const provenance=sanitizeProvenance(raw.provenance??{});
 /** ISIN claim against a row of this issuer: set when the row has none, correct when it differs. */
 const claimOnRow=async(row:Row)=>{
  if(!sec.isin||!raw.claimEvidence)return;
  const current=str(row.isin);
  const op=current===null?'set_identifier':'correct_identifier';
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'isin',value:sec.isin,source:sec.source,op,
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id,ticker:sec.ticker,valid_from:String(row.valid_from)},
    params:current===null?{}:{expected_current:current,new_value:sec.isin},evidence:raw.claimEvidence.evidence})});
 };
 /** Another holder blocks the window: an open incoming window with an ISIN becomes attach_security. */
 const claimAttach=async(note?:string)=>{
  if(!sec.isin||!raw.claimEvidence||sec.valid_to!==null)return;
  await fileClaim(client,{issuer_id:sec.issuer_id,id_type:'ticker',value:sec.ticker,source:sec.source,op:'attach_security',
   detail:buildClaimDetail({evidence_kind:raw.claimEvidence.kind,target:{issuer_id:sec.issuer_id},
    params:{share_class:sec.share_class,valid_from:sec.valid_from,valid_from_method:methods.valid_from_method,source:sec.source,isin:sec.isin,...(note?{note}:{})},evidence:raw.claimEvidence.evidence})});
 };
 /** null when nothing on this ticker overlaps the incoming window (safe to insert). */
 const classify=async():Promise<AttachResult|null>=>{
  // A ticker has a handful of ownership rows at most; overlap is computed here, not in SQL.
  const rows=await client.select('issuer_securities',{ticker:sec.ticker},{orderBy:'valid_from'});
  const same=rows.find(r=>r.issuer_id===sec.issuer_id&&String(r.valid_from)===sec.valid_from);
  if(same){
   // Same primary key: a replay is a duplicate only if the window end and (when given) ISIN agree.
   // An absent incoming ISIN carries no information and never contradicts a stored one.
   const isinDiffers=sec.isin!==null&&same.isin!==sec.isin;
   if(str(same.valid_to)===sec.valid_to&&!isinDiffers)return 'duplicate';
   if(isinDiffers)await claimOnRow(same);
   return 'conflict';
  }
  const hit=rows.filter(r=>overlaps(r,sec));
  if(!hit.length)return null;
  // Same issuer under a different valid_from: a duplicate unless the incoming ISIN contradicts an
  // overlapping row's ISIN (an absent incoming ISIN never contradicts).
  if(hit.every(r=>r.issuer_id===sec.issuer_id)){
   const differing=sec.isin===null?undefined:hit.find(r=>r.isin!==sec.isin);
   if(!differing)return 'duplicate';
   await claimOnRow(differing);
   return 'conflict';
  }
  await claimAttach();
  return 'conflict';
 };
 const before=await classify();
 if(before)return before;
 try{
  await client.insert('issuer_securities',{
   issuer_id:sec.issuer_id,ticker:sec.ticker,isin:sec.isin,figi:sec.figi??null,share_class:sec.share_class,
   is_primary:sec.is_primary??false,valid_from:sec.valid_from,valid_to:sec.valid_to,
   valid_from_method:methods.valid_from_method,valid_to_method:methods.valid_to_method,source:sec.source,provenance,
  });
  return 'inserted';
 }catch(e){
  const code=(e as {code?:unknown})?.code;
  if(code==='23514'&&e instanceof Error&&e.message.includes('issuer_not_active:'))throw new Error('issuer_not_active');
  if(!isUnique(e))throw e;
  // The ISIN index (isin, valid_from) and the ISIN no-overlap exclusion span tickers: another
  // ticker already carries this ISIN over an overlapping window. A ticker-only re-read cannot see it.
  if(e instanceof Error&&(e.message.includes('issuer_securities_isin_idx')||(code==='23P01'&&e.message.includes('issuer_securities_isin_no_overlap')))){
   await claimAttach('isin_held_by_other_ticker');
   return 'conflict';
  }
  // A concurrent writer took the window (PK, open-owner index or no-overlap exclusion): re-read once.
  const after=await classify();
  if(after)return after;
  // A unique violation that no current row explains is an exact replay that raced us.
  if(code==='23505')return 'duplicate';
  throw e;
 }
}

exec
/bin/zsh -lc "rg -n 'runLoadAShare|snapshots|raw_hash' scripts/*a-share* src/app/api/cron/*a-share*/* src/lib/industry/providers/tushare-industry.ts; ls -a | head -25; rg -n 'snapshot|backdate' src/lib/industry/load-a-share.test.ts; cat package.json | head -65" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
zsh:1: no matches found: scripts/*a-share*
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
8:import {memorySnapshotStore} from '../facts/snapshot-store';
144: // list_date is retained as an evidence_only claim suggesting backdate_window (filed once, reruns dedupe onto it).
145: const backdateClaims=(t:ReturnType<typeof tablesFor>)=>t.rows('issuer_identifier_claims').map(c=>[c.issuer_id,c.id_type,c.value,c.op,c.status,c.source]);
147:  expect(backdateClaims(t)).toEqual([['i-1','ticker','600519.SH','evidence_only','pending','tushare:stock_basic']]);
149:   params:{suggested_op:'backdate_window',ticker:'600519.SH',valid_from:'2026-01-05',list_date:'2001-08-27',exchange:'SSE',list_status:'L'},evidence});
151: it('fast path: an existing security is a duplicate and is not rewritten; the list_date is kept as a backdate_window evidence claim',async()=>{
176: it('attachSecurity duplicate (recheck path) leaves the row untouched and keeps the page evidence in a backdate_window claim',async()=>{
240: it('apply with a snapshot store persists every stock_basic page',async()=>{
242:  await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup,snapshots:{store}});
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

exec
/bin/zsh -lc "nl -ba src/lib/industry/load-a-share.ts | sed -n '202,214p'; rg -n -A5 'function isCurrentSecurity' src/lib/entities/resolve.ts; rg -n 'runLoadAShare\\(' src scripts | head -20" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
   202	   }
   203	   const res=await attachSecurity(tables,{issuer_id:issuerId,ticker:c.ts_code,share_class:'A',is_primary:true,valid_from:validFrom,valid_from_method:validFromMethod,
   204	    source:STOCK_BASIC_SOURCE,provenance:validFromEvidence(c,today,opts.observedAt)});
   205	   if(res==='inserted')counts.inserted++;
   206	   else if(res==='duplicate'){
   207	    const mine=(await tables.select('issuer_securities',{issuer_id:issuerId,ticker:c.ts_code})).find(r=>isCurrentSecurity(r,today));
   208	    if(mine)await suggestBackdate(tables,mine,c,opts.observedAt,opts.pageRefs?.get(c.ts_code));
   209	    counts.duplicates++;
   210	   }
   211	   else{
   212	    await fileClaim(tables,{issuer_id:issuerId,id_type:'ticker',value:c.ts_code,source:STOCK_BASIC_SOURCE,op:'attach_security',
   213	     detail:buildClaimDetail({evidence_kind:'provider_mapping',target:{issuer_id:issuerId},
   214	      params:{share_class:'A',valid_from:validFrom,valid_from_method:validFromMethod,source:STOCK_BASIC_SOURCE,note:'ticker_held_by_other_issuer'},evidence:stockBasicEvidence(c,opts.observedAt,opts.pageRefs?.get(c.ts_code))})});
src/lib/industry/load-a-share.test.ts:212:  const r=await runLoadAShare(d,{apply:false,sleep:noSleep});
src/lib/industry/load-a-share.test.ts:218:  const r=await runLoadAShare(d,{apply:true,triggeredBy:'cron',sleep:noSleep,lookupOrgId:realLookup});
src/lib/industry/load-a-share.test.ts:230:  await expect(runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup})).rejects.toMatchObject({code:'quota_exhausted'});
src/lib/industry/load-a-share.test.ts:237:  await expect(runLoadAShare({...depsFor(t2),tushare:d.tushare},{apply:false,sleep:noSleep})).rejects.toMatchObject({code:'quota_exhausted'});
src/lib/industry/load-a-share.test.ts:242:  await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup,snapshots:{store}});
src/lib/industry/load-a-share.test.ts:248:  await runLoadAShare(d,{apply:false,sleep:noSleep});
src/lib/industry/load-a-share.test.ts:250:  const first=await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup});
src/lib/industry/load-a-share.test.ts:254:  const again=await runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup});
src/lib/industry/load-a-share.test.ts:262:  const third=await runLoadAShare({...d,tushare:moved},{apply:true,sleep:noSleep,lookupOrgId:realLookup});
src/lib/industry/load-a-share.test.ts:270:  await expect(runLoadAShare(d,{apply:true,sleep:noSleep,lookupOrgId:realLookup})).rejects.toThrow('code_version_missing');
src/lib/industry/jobs.ts:85:   const r=await runLoadAShare(deps,{apply:!opts.dryRun,triggeredBy,today:opts.today,maxLookups:opts.limit,...captureOf(deps)});
src/lib/industry/load-a-share.ts:233:export async function runLoadAShare(deps:IndustryDeps,opts:RunLoadAShareOptions):Promise<RunLoadAShareResult>{

codex
The changes preserve listing-date evidence through the existing claim validation and deduplication mechanisms without modifying security windows. No actionable regression introduced by this commit was identified. Tests were inspected but not executed.
The changes preserve listing-date evidence through the existing claim validation and deduplication mechanisms without modifying security windows. No actionable regression introduced by this commit was identified. Tests were inspected but not executed.

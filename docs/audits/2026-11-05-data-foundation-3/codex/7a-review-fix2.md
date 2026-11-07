OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b041-e623-7f42-9312-a2f54ce77372
--------
user
commit 388ba8d
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 388ba8d; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 385ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-SsFymEw2' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bUddWdKj' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-j5VN2p57' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-BwHS9LUI' (errno=Operation not permitted)
388ba8d fix(entities): link-ah round 2 (per-ISIN claim evidence identity, hints no longer suppress rule 2, stable quarantine key, contested tickers, ticker-lookup failures)
 scripts/entity-keys/link-ah.ts   |  9 +++---
 src/lib/entities/link-ah.test.ts | 59 ++++++++++++++++++++++++++++++++++++++--
 src/lib/entities/link-ah.ts      | 30 +++++++++++++-------
 3 files changed, 81 insertions(+), 17 deletions(-)

exec
/bin/zsh -lc 'pwd; for d in . .. ../.. ../../..; do ls "$d"/AGENTS* "$d"/CLAUDE.md 2>/dev/null; done; git show 388ba8d --; cat src/lib/entities/link-ah.ts; cat scripts/entity-keys/link-ah.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
zsh:1: no matches found: ./AGENTS*
zsh:1: no matches found: ../AGENTS*
zsh:1: no matches found: ../../AGENTS*
../../../AGENTS.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-dBVrNoMD' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-0S0ym9NF' (errno=Operation not permitted)
commit 388ba8d87e80430e8451adfb72bd30b56427b413
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:47:36 2026 -0800

    fix(entities): link-ah round 2 (per-ISIN claim evidence identity, hints no longer suppress rule 2, stable quarantine key, contested tickers, ticker-lookup failures)
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/scripts/entity-keys/link-ah.ts b/scripts/entity-keys/link-ah.ts
index 70e3aeb..28c4d6c 100644
--- a/scripts/entity-keys/link-ah.ts
+++ b/scripts/entity-keys/link-ah.ts
@@ -3,7 +3,8 @@
  * the listing date), rule 2 HKEX list name match (attach_security claims only).
  *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
  * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
- * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is linked only when validated (HKEX code + ISIN, or ticker-level FIGI).
+ * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is attached automatically only when the HKEX ISIN of its stock code equals the
+ * ISIN OpenFIGI mapped; every other hit becomes an attach_security claim (a ticker-level FIGI lookup is evidence only).
  * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
  * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
  * (dataset entities.ah-link) and a freshness attempt.
@@ -79,10 +80,10 @@ async function main(){
   // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
   const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
   const tickerLookup=new Map<string,TickerLookup>();
-  let exhausted=m.exhausted;
+  let exhausted=m.exhausted,tickerFailures=0;
   if(unvalidated.length&&!exhausted){
    const t=await mapTickers(unvalidated,deps);
-   exhausted=t.exhausted;
+   exhausted=t.exhausted;tickerFailures=t.failures.length+t.unprocessed.length;
    for(const [tk,r] of t.byKey){
     if(r.status!=='ok')continue;
     const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
@@ -93,7 +94,7 @@ async function main(){
   const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),
    hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
    raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
-  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
+  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length+tickerFailures,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
  };
  if(!apply){
   const {plan,exhausted}=await run(memoryRawStore(),null);
diff --git a/src/lib/entities/link-ah.test.ts b/src/lib/entities/link-ah.test.ts
index bbd93b3..e66c0d2 100644
--- a/src/lib/entities/link-ah.test.ts
+++ b/src/lib/entities/link-ah.test.ts
@@ -1,6 +1,7 @@
 // src/lib/entities/link-ah.test.ts
 import {describe,it,expect} from 'vitest';
 import {memoryTableClient} from '../db/memory-table-client';
+import {TableError,type Row,type TableClient} from '../db/table-client';
 import {memoryRawStore} from '../dq/raw-store';
 import {loaderOutcome} from './load-sec';
 import {mapIsins,type FigiJob,type FigiJobResult,type FigiRecord} from './identifiers/openfigi';
@@ -40,7 +41,7 @@ describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
   const e={gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:RAWS.hkex.path};
   const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
   expect(owned.attaches).toEqual([]);
-  expect(owned.conflicts).toEqual([{naturalKey:`02338.HK:${ASOF}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,classified:['hard'],evidence:e},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9'}}]);
+  expect(owned.conflicts).toEqual([{naturalKey:'02338.HK:2004-03-11',detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,classified:['hard'],evidence:e},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',valid_from:'2004-03-11'}}]);
   const soft=planAhLinks(input({hkexIsins:new Map(),openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
   expect([soft.claims,soft.attaches]).toEqual([[],[]]);
   expect(soft.conflicts[0].detail).toMatchObject({classified:['soft'],owner_issuer_id:B});
@@ -59,7 +60,7 @@ describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
   const c=p.claims[0];
   expect(c).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',op:'attach_security',source:'gleif_openfigi',detail:{evidence_kind:'provider_mapping',target:{issuer_id:A},
    params:{ticker:'02338.HK',isin:'CNE1000004L9',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi'}}});
-  expect(c.detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','openfigi_ticker']);
+  expect(c.detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','openfigi_ticker']);
   expect(c.detail.sources[0].note).toContain(`request ${'b'.repeat(64)}`);
   expect(c.detail.sources[0].note).toContain('FIGI BBG000WEICH1, composite');
   expect(c.detail.sources[1]).toMatchObject({evidence_sha256:'9'.repeat(64),locator:`openfigi:${'9'.repeat(64)}#2`});
@@ -72,7 +73,7 @@ describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
   expect(d.attaches).toEqual([]);
   expect(d.claims).toHaveLength(1);
   expect(d.claims[0].detail.params).not.toHaveProperty('isin');
-  expect(d.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi','hkex_isin_hkex']);
+  expect(d.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','hkex_isin_hkex']);
   expect(d.claims[0].detail.sources[1].note).toContain('disagrees');
   const second=planAhLinks(input({issuers:[iss({hTickers:['00001.HK']})]}));
   expect([second.attaches.length,second.claims.length]).toEqual([0,1]);
@@ -114,6 +115,28 @@ describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
  });
 });
 
+describe('planAhLinks · review round 2',()=>{
+ it('an unconfirmed provider hint does not suppress rule 2; a name match on the same ticker adds evidence to the one claim',()=>{
+  const list=hkexList([{stockCode:'02899',name:'WEICHAI POWER CO LTD - H',category:'Equity'}]);
+  const p=planAhLinks(input({hkexIsins:new Map(),hkex:list,universe:new Map([...UNI,['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]])}));
+  expect(p.claims.map(c=>[c.value,c.source]).sort()).toEqual([['02338.HK','gleif_openfigi'],['02899.HK','hkex_list_name_match']]);
+  const same=planAhLinks(input({hkexIsins:new Map(),hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'}])}));
+  expect(same.claims).toHaveLength(1);
+  expect(same.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','hkex_list_of_securities']);
+  // a CONFIRMED (auto-attached) link still suppresses rule 2
+  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02899',name:'WEICHAI POWER CO LTD - H',category:'Equity'}])})).claims).toEqual([]);
+ });
+ it('two issuers that would auto-attach the same ticker are both quarantined (no first-wins)',async()=>{
+  const p=planAhLinks(input({issuers:[iss({}),iss({issuer_id:B,lei:'529900T8BM49AURSDO66'})],figiHits:[hit(),hit({issuer_id:B,lei:'529900T8BM49AURSDO66'})]}));
+  expect(p.attaches).toEqual([]);
+  expect(p.conflicts.map(c=>[c.naturalKey,c.detail.reason,c.payload.issuer_id])).toEqual([['02338.HK:2004-03-11','ticker_claimed_by_several_issuers',A],['02338.HK:2004-03-11','ticker_claimed_by_several_issuers',B]]);
+  expect(p.conflicts[0].detail.competing_issuer_ids).toEqual([B]);
+  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  const r=await applyAhLinks(c,p,{batchId:BATCH,dataset:DATASET});
+  expect(r.counts).toMatchObject({inserted:0,quarantined:2});
+ });
+});
+
 describe('selectAhIssuers',()=>{
  it('keeps LEI-bearing issuers for rule 1 even without A rows or USCI; A-share restriction stays with rule 2 / share class',()=>{
   const rows=[
@@ -217,4 +240,34 @@ describe('applyAhLinks',()=>{
   expect(c2.rows('dq_quarantine')[0].reason_code).toBe('window_conflict');
   expect(c2.rows('dq_quarantine')[0].detail).toMatchObject({reason:'window_overlaps_own_row',evidence:{gleif_sha256:'a'.repeat(64)}});
  });
+
+ it('persists every grouped mapping through fileClaim dedupe, and a replay in a later run adds no quarantine row',async()=>{
+  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  const hits=[hit(),hit({isin:'CNE1000004M7',index:1})];
+  const plan=planAhLinks(input({figiHits:hits,hkexIsins:new Map()}));
+  await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
+  const rows=c.rows('issuer_identifier_claims');
+  expect(rows).toHaveLength(1);
+  const d=rows[0].detail as {evidence:{source:string;locator?:string};sources:{source:string;locator?:string}[]};
+  const srcs=[d.evidence,...d.sources];   // sources holds the non-primary items
+  expect(srcs.map(x=>x.source).sort()).toEqual(['gleif_openfigi:CNE1000004L9','gleif_openfigi:CNE1000004M7']);
+  expect(srcs.every(x=>x.locator)).toBe(true);
+  // ownership conflict replayed with a different asOf: same stable key, one open row
+  const q=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  const owned=(asOf:string)=>planAhLinks(input({asOf,openOwner:new Map([['02338.HK',B]])}));
+  await applyAhLinks(q,owned('2026-11-05'),{batchId:BATCH,dataset:DATASET});
+  await applyAhLinks(q,owned('2026-11-12'),{batchId:BATCH,dataset:DATASET});
+  expect(q.rows('dq_quarantine').map(r=>r.natural_key)).toEqual(['02338.HK:2004-03-11']);
+ });
+ it('names an identifier conflict when the ISIN is already held by another ticker',async()=>{
+  const mem=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
+  await mem.insert('issuer_securities',{issuer_id:B,ticker:'600000.SH',isin:'CNE1000004L9',figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
+  // the real DB raises its ISIN unique index on insert; the memory client has no such index
+  const c:TableClient={...mem,insert:async(t:string,row:Row)=>{if(t==='issuer_securities')throw new TableError('insert',t,'duplicate key value violates unique constraint "issuer_securities_isin_idx"','23505');return mem.insert(t,row);}};
+  const r=await applyAhLinks(c,planAhLinks(input({raw:RAWS})),{batchId:BATCH,dataset:DATASET});
+  const q=mem.rows('dq_quarantine');
+  expect(q.map(x=>x.reason_code)).toEqual(['identifier_conflict']);
+  expect(q[0].detail).toMatchObject({reason:'isin_held_by_other_row',isin:'CNE1000004L9',holders:[{issuer_id:B,ticker:'600000.SH'}],evidence:{gleif_sha256:'a'.repeat(64)}});
+  expect(r.counts).toMatchObject({quarantined:1,failed:0});
+ });
 });
diff --git a/src/lib/entities/link-ah.ts b/src/lib/entities/link-ah.ts
index a8fd31b..4d8cbc6 100644
--- a/src/lib/entities/link-ah.ts
+++ b/src/lib/entities/link-ah.ts
@@ -116,10 +116,10 @@ const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 type Kind='hard'|'disagree'|'soft';
 type Classified={skip:string}|{kind:Kind;hk:HkexIsin|null};
 /** Per-hit gate, in this order: superseded counter (rejected before any validation), non-equity, not in universe; then hard / disagree / soft. */
-function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
+function classifyHit(h:AhFigiHit,input:AhLinkInput,rowsByCode:ReadonlyMap<string,readonly HkexListRow[]>):Classified{
  const code=h.ticker.slice(0,5);
  const k=input.hkexIsins?.get(code)??null;
- const rows=input.hkex?.rows.filter(r=>r.stockCode===code)??[];
+ const rows=rowsByCode.get(code)??[];
  const live=rows.filter(r=>!SUPERSEDED.test((r.name??'').trim()));
  if((rows.length>0&&live.length===0)||(!k&&input.hkexSuperseded?.has(code)))return {skip:'superseded_counter'};
  if(live.length>0&&!live.some(r=>r.category?.trim().toLowerCase()===HKEX_EQUITY_CATEGORY))return {skip:'not_equity'};
@@ -131,38 +131,46 @@ function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
 export function planAhLinks(input:AhLinkInput):AhLinkPlan{
  const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
  const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
+ // issuers with a CONFIRMED link (auto-attached or already holding the line): only they are skipped by rule 2
  const linked=new Set<string>();
+ const rowsByCode=new Map<string,HkexListRow[]>();
+ for(const r of input.hkex?.rows??[])rowsByCode.set(r.stockCode,[...(rowsByCode.get(r.stockCode)??[]),r]);
  // 1. classify every hit (order independent), 2. group per (issuer, ticker), 3. decide per group
  const groups=new Map<string,{issuer:AhIssuer;ticker:string;hits:{h:AhFigiHit;c:{kind:Kind;hk:HkexIsin|null}}[]}>();
  const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
  for(const h of hits){
   const issuer=byId.get(h.issuer_id);
   if(!issuer)continue;
-  const c=classifyHit(h,input);
+  const c=classifyHit(h,input,rowsByCode);
   if('skip' in c){plan.skipped.push(c.skip);continue;}
   const k=`${h.issuer_id}|${h.ticker}`;
   const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
   g.hits.push({h,c});groups.set(k,g);
  }
+ const issuersByTicker=new Map<string,string[]>();
+ for(const g of groups.values())issuersByTicker.set(g.ticker,[...(issuersByTicker.get(g.ticker)??[]),g.issuer.issuer_id]);
  for(const k of [...groups.keys()].sort()){
   const {issuer:i,ticker,hits:gh}=groups.get(k)!;
   const u=input.universe.get(ticker)!;
   const owner=input.openOwner.get(ticker);
   if(owner===i.issuer_id||i.hTickers.includes(ticker)){plan.skipped.push('already_attached');linked.add(i.issuer_id);continue;}
+  const l=listing(u,input.asOf);   // before the owner check: the quarantine key is `${ticker}:${valid_from}` (stable across runs, like load-sec)
+  const rivals=(issuersByTicker.get(ticker)??[]).filter(x=>x!==i.issuer_id).sort();
   const first=gh[0].h;
   const g0=input.raw?.gleif,hk0=input.raw?.hkex;
   const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
    ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
   const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
-  if(owner!==undefined){
-   plan.conflicts.push({naturalKey:`${ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence},
-    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin}});
-   linked.add(i.issuer_id);continue;
+  if(owner!==undefined||rivals.length){
+   plan.conflicts.push({naturalKey:`${ticker}:${l.valid_from}`,detail:owner!==undefined
+    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence}
+    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:rivals,classified:kinds,evidence:rawEvidence},
+    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin,valid_from:l.valid_from}});
+   continue;
   }
   const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
   const hard=gh.filter(x=>x.c.kind==='hard');
   const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
-  const l=listing(u,input.asOf);
   const figiHit=gh.find(x=>x.h.figi);
   if(auto){
    const hk=hard[0].c.hk!;const h=hard[0].h;
@@ -180,7 +188,7 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
   const sources:ClaimEvidence[]=[];
   const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
   for(const {h,c} of gh){
-   add({source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
+   add({source:`gleif_openfigi:${h.isin}`,as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
     note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
    if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
     note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
@@ -196,7 +204,7 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
    evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   }});
-  linked.add(i.issuer_id);
+  // an unconfirmed provider hint does not suppress rule 2
  }
  if(input.hkex){
   const hk=input.hkex;
@@ -222,6 +230,8 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
    const l=listing(u,input.asOf);
    const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
+   const existing=plan.claims.find(c=>c.issuer_id===i.issuer_id&&c.value===ticker&&c.op==='attach_security');
+   if(existing){existing.detail.sources.push(evidence);continue;}   // one claim per issuer+ticker: the name match is more evidence for the same hint
    plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
     schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
     params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
// src/lib/entities/link-ah.ts
// A+H linking (spec §4.2.2). Rule 1 (automatic, hard_identifier): an issuer's LEI → GLEIF ISINs →
// OpenFIGI HK line that is in stocks_universe and held by nobody → attachSecurity at the listing
// date (listing_date) or the run date (first_observed); held by another issuer → ownership_conflict.
// Rule 2 (claims only, name_match): an issuer holding A-share rows, no H row and a name, whose
// normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
// only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
// waits for a confirmed source (spec §14-1).
// OpenFIGI tickers are HINTS: one ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK,
// TCTZF). Hits are classified first (superseded -OLD counters, non-equity, not in universe are
// dropped and summarised), then grouped per (issuer, ticker) and decided deterministically:
//   - automatic attach ONLY on hard identifiers: HKEX ISIN of the stock code == the hit's ISIN
//     (and no conflicting hit for that ticker);
//   - every other in-universe HK hit not held by the issuer (no HKEX ISIN, HKEX/GLEIF ISIN
//     disagreement, a second H line, ambiguous ISINs) becomes an attach_security claim
//     (provider_mapping) with all evidence, a ticker-level FIGI lookup being evidence only;
//   - a ticker open at another issuer is an ownership_conflict quarantine.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {fileClaim,type ClaimInput} from './claims';
import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
import {groupFigiResults,type FigiEvidence,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
import {rawPath} from '../dq/raw-store';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';
import {attachSecurity} from './securities';
import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';

/** HKEX list Category value for ordinary equity, compared lower-cased and EXACTLY (live categories include "Equity Warrants…" and "Real Estate Investment Trusts"). */
export const HKEX_EQUITY_CATEGORY='equity';
export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;requestSha256?:string;responseSha256:string;index:number;lei:string}
export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
/** A ticker-level OpenFIGI lookup: evidence only, never grounds for an automatic attach. */
export interface TickerLookup{figi:string;level:'composite'|'venue';evidence:FigiEvidence}
/** A per-job OpenFIGI `error` result (not `not_found`): the batch must fail with its evidence. */
export interface FigiJobError{isin:string;lei:string;message:string;evidence:FigiEvidence}
export interface AhLinkInput{
 asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
 universe:ReadonlyMap<string,UniverseListing>;
 /** ticker → issuer_id of its open row */
 openOwner:ReadonlyMap<string,string>;
 hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
 /** 5-digit stock code → ISIN (mergeHkexIsins): the hard identifier for automatic attach */
 hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
 /** 5-digit codes of superseded (-OLD) counters dropped by mergeHkexIsins */
 hkexSuperseded?:ReadonlySet<string>;
 tickerLookup?:ReadonlyMap<string,TickerLookup>;
 figiErrors?:readonly FigiJobError[];
 /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
 raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
}
export interface AhLinkPlan{
 attaches:IssuerSecurityInput[];
 /** planned evidence per attach, keyed `${issuer_id}|${ticker}`: kept in the quarantine if the apply-time insert conflicts */
 attachEvidence:Record<string,Record<string,unknown>>;
 conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[];figiErrors:FigiJobError[];
}

const SUPERSEDED=/-\s*old$/i;
export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';

/**
 * Issuers a run considers. Rule 1 needs only a LEI (share_class falls back to 'unknown'); rule 2
 * and the 'H' share class need A-share rows, which planAhLinks enforces itself.
 */
export function selectAhIssuers(issuers:readonly {issuer_id:string;lei:string|null;usci:string|null;names:string[]}[],openTickers:readonly {issuer_id:string;ticker:string}[]):AhIssuer[]{
 const by=new Map<string,string[]>();
 for(const t of openTickers)by.set(t.issuer_id,[...(by.get(t.issuer_id)??[]),t.ticker]);
 return issuers.map(i=>{
  const ts=by.get(i.issuer_id)??[];
  return {issuer_id:i.issuer_id,lei:i.lei,usci:i.usci,names:i.names,aTickers:ts.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:ts.filter(t=>/^\d{5}\.HK$/.test(t))};
 }).filter(i=>i.lei!==null||i.aTickers.length>0);
}

/** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
 const out:AhFigiHit[]=[];
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='ok')continue;
   for(const c of groupFigiResults(r.records).candidates){
    if(c.market!=='HK')continue;
    const one=c.groups.length===1?c.groups[0]:null;
    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,requestSha256:r.evidence.request_sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
   }
  }
 }
 return out;
}

/** Per-job `error` results for the issuers' ISINs (`not_found` is a normal outcome and is not listed). */
export function figiErrorsFromResults(issuers:readonly AhIssuer[],gleif:{byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):FigiJobError[]{
 const out:FigiJobError[]=[];const seen=new Set<string>();
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='error'||seen.has(isin))continue;
   seen.add(isin);out.push({isin,lei:i.lei,message:r.message.slice(0,200),evidence:r.evidence});
  }
 }
 return out.sort((a,b)=>a.isin<b.isin?-1:1);
}

function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
 if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
 return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
}
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;

type Kind='hard'|'disagree'|'soft';
type Classified={skip:string}|{kind:Kind;hk:HkexIsin|null};
/** Per-hit gate, in this order: superseded counter (rejected before any validation), non-equity, not in universe; then hard / disagree / soft. */
function classifyHit(h:AhFigiHit,input:AhLinkInput,rowsByCode:ReadonlyMap<string,readonly HkexListRow[]>):Classified{
 const code=h.ticker.slice(0,5);
 const k=input.hkexIsins?.get(code)??null;
 const rows=rowsByCode.get(code)??[];
 const live=rows.filter(r=>!SUPERSEDED.test((r.name??'').trim()));
 if((rows.length>0&&live.length===0)||(!k&&input.hkexSuperseded?.has(code)))return {skip:'superseded_counter'};
 if(live.length>0&&!live.some(r=>r.category?.trim().toLowerCase()===HKEX_EQUITY_CATEGORY))return {skip:'not_equity'};
 if(!input.universe.has(h.ticker))return {skip:'ticker_not_in_universe'};
 if(!k)return {kind:'soft',hk:null};
 return {kind:k.isin===h.isin?'hard':'disagree',hk:k};
}

export function planAhLinks(input:AhLinkInput):AhLinkPlan{
 const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
 const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
 // issuers with a CONFIRMED link (auto-attached or already holding the line): only they are skipped by rule 2
 const linked=new Set<string>();
 const rowsByCode=new Map<string,HkexListRow[]>();
 for(const r of input.hkex?.rows??[])rowsByCode.set(r.stockCode,[...(rowsByCode.get(r.stockCode)??[]),r]);
 // 1. classify every hit (order independent), 2. group per (issuer, ticker), 3. decide per group
 const groups=new Map<string,{issuer:AhIssuer;ticker:string;hits:{h:AhFigiHit;c:{kind:Kind;hk:HkexIsin|null}}[]}>();
 const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
 for(const h of hits){
  const issuer=byId.get(h.issuer_id);
  if(!issuer)continue;
  const c=classifyHit(h,input,rowsByCode);
  if('skip' in c){plan.skipped.push(c.skip);continue;}
  const k=`${h.issuer_id}|${h.ticker}`;
  const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
  g.hits.push({h,c});groups.set(k,g);
 }
 const issuersByTicker=new Map<string,string[]>();
 for(const g of groups.values())issuersByTicker.set(g.ticker,[...(issuersByTicker.get(g.ticker)??[]),g.issuer.issuer_id]);
 for(const k of [...groups.keys()].sort()){
  const {issuer:i,ticker,hits:gh}=groups.get(k)!;
  const u=input.universe.get(ticker)!;
  const owner=input.openOwner.get(ticker);
  if(owner===i.issuer_id||i.hTickers.includes(ticker)){plan.skipped.push('already_attached');linked.add(i.issuer_id);continue;}
  const l=listing(u,input.asOf);   // before the owner check: the quarantine key is `${ticker}:${valid_from}` (stable across runs, like load-sec)
  const rivals=(issuersByTicker.get(ticker)??[]).filter(x=>x!==i.issuer_id).sort();
  const first=gh[0].h;
  const g0=input.raw?.gleif,hk0=input.raw?.hkex;
  const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
   ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
  const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
  if(owner!==undefined||rivals.length){
   plan.conflicts.push({naturalKey:`${ticker}:${l.valid_from}`,detail:owner!==undefined
    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence}
    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:rivals,classified:kinds,evidence:rawEvidence},
    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin,valid_from:l.valid_from}});
   continue;
  }
  const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
  const hard=gh.filter(x=>x.c.kind==='hard');
  const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
  const figiHit=gh.find(x=>x.h.figi);
  if(auto){
   const hk=hard[0].c.hk!;const h=hard[0].h;
   const provenance=sanitizeProvenance({
    isin:{source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${hk.row}`,
     corroborated_by:[{source:'gleif_openfigi',evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`}]},
    ...(figiHit?.h.figi?{figi:{source:'openfigi',as_of:input.asOf,evidence_sha256:figiHit.h.responseSha256,job:jobOf(figiHit.h.job),level:figiHit.h.level}}:{}),
    ...l.prov,
   });
   plan.attaches.push({issuer_id:i.issuer_id,ticker,isin:h.isin,figi:figiHit?.h.figi??null,share_class:shareClassFor(i),is_primary:false,valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',provenance});
   plan.attachEvidence[k]={rule:'same_lei',validated_by:'hkex_isin',evidence:rawEvidence,isin:h.isin};
   linked.add(i.issuer_id);continue;
  }
  // claim: everything not backed by an HKEX ISIN equal to the GLEIF/OpenFIGI one
  const sources:ClaimEvidence[]=[];
  const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
  for(const {h,c} of gh){
   add({source:`gleif_openfigi:${h.isin}`,as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
    note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
   if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
    note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
  }
  const tl=input.tickerLookup?.get(ticker);
  if(tl)add({source:'openfigi_ticker',as_of:input.asOf,evidence_sha256:tl.evidence.response_sha256,locator:`openfigi:${tl.evidence.response_sha256}#${tl.evidence.index}`,
   note:`ticker-level lookup FIGI ${tl.figi} (${tl.level}); request ${tl.evidence.request_sha256}; ${figiHit?.h.figi?(tl.figi===figiHit.h.figi?'matches':'differs from')+` ISIN-level FIGI ${figiHit.h.figi}`:'no ISIN-level FIGI to compare'}`});
  const why=i.hTickers.length>0?'issuer already holds an H line':kinds.includes('disagree')?'HKEX and GLEIF/OpenFIGI ISINs disagree':isins.length>1?'several ISINs map to this ticker':'no HKEX ISIN confirms this listing';
  const evidence:ClaimEvidence={...sources[0],note:`${sources[0].note??''}; review: ${why}`.slice(0,500)};
  sources[0]=evidence;
  plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'gleif_openfigi',op:'attach_security',detail:{
   schema:'claim/1',evidence_kind:'provider_mapping',target:{issuer_id:i.issuer_id},
   params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
   evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
  }});
  // an unconfirmed provider hint does not suppress rule 2
 }
 if(input.hkex){
  const hk=input.hkex;
  const byName=new Map<string,HkexListRow[]>();
  for(const r of hk.rows){
   if(r.category?.trim().toLowerCase()!==HKEX_EQUITY_CATEGORY||!r.name||SUPERSEDED.test(r.name.trim()))continue;
   const n=normalizeCompanyName(r.name);
   if(!n)continue;
   byName.set(n,[...(byName.get(n)??[]),r]);
  }
  for(const i of input.issuers){
   if(linked.has(i.issuer_id)||i.aTickers.length===0||i.hTickers.length>0)continue;
   const names=new Set(i.names.map(normalizeCompanyName).filter(n=>n!==''));
   if(!names.size){plan.skipped.push('name_match_no_name');continue;}
   const codes=new Map<string,HkexListRow>();
   for(const n of names)for(const r of byName.get(n)??[])codes.set(r.stockCode,r);
   if(codes.size!==1){plan.skipped.push(codes.size?'name_match_multiple':'name_match_none');continue;}
   const row=[...codes.values()][0];
   const ticker=`${row.stockCode}.HK`;
   const u=input.universe.get(ticker);
   if(!u){plan.skipped.push('ticker_not_in_universe');continue;}
   const owner=input.openOwner.get(ticker);
   if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
   const l=listing(u,input.asOf);
   const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
   const existing=plan.claims.find(c=>c.issuer_id===i.issuer_id&&c.value===ticker&&c.op==='attach_security');
   if(existing){existing.detail.sources.push(evidence);continue;}   // one claim per issuer+ticker: the name match is more evidence for the same hint
   plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
    schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
    evidence,sources:[evidence],...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   }});
  }
 }
 plan.skipped.sort();
 return plan;
}

/** Re-reads the ticker's rows after attachSecurity reported a conflict and names the actual cause. */
async function conflictCause(tables:TableClient,a:IssuerSecurityInput):Promise<{reasonCode:string;detail:Record<string,unknown>}>{
 const rows=await tables.select('issuer_securities',{ticker:a.ticker},{orderBy:'valid_from'});
 const to=a.valid_to??null;
 const overlap=rows.filter(r=>(to===null||String(r.valid_from)<to)&&(r.valid_to==null||a.valid_from<String(r.valid_to)));
 const other=overlap.find(r=>r.issuer_id!==a.issuer_id);
 if(other)return {reasonCode:'ownership_conflict',detail:{reason:'ticker_owned_by_other_issuer',owner_issuer_id:String(other.issuer_id),owner_valid_from:String(other.valid_from),owner_valid_to:other.valid_to==null?null:String(other.valid_to)}};
 const own=rows.filter(r=>r.issuer_id===a.issuer_id&&(overlap.includes(r)||String(r.valid_from)===a.valid_from));
 if(own.length)return {reasonCode:'window_conflict',detail:{reason:'window_overlaps_own_row',rows:own.map(r=>({valid_from:String(r.valid_from),valid_to:r.valid_to==null?null:String(r.valid_to),isin:r.isin==null?null:String(r.isin)}))}};
 const holders=a.isin?(await tables.select('issuer_securities',{isin:a.isin},{orderBy:'valid_from'})).filter(r=>r.ticker!==a.ticker):[];
 return {reasonCode:'identifier_conflict',detail:{reason:'isin_held_by_other_row',isin:a.isin??null,holders:holders.map(r=>({issuer_id:String(r.issuer_id),ticker:String(r.ticker),valid_from:String(r.valid_from)}))}};
}

export async function applyAhLinks(tables:TableClient,plan:AhLinkPlan,opts:{batchId:string;dataset:string}):Promise<ApplyResult&{claims:Record<string,number>}>{
 const counts=emptyCounts();const errors:BatchError[]=[];const claims:Record<string,number>={};
 const park=(reasonCode:string,naturalKey:string,detail:Record<string,unknown>,payload:Record<string,unknown>)=>parkConflict(tables,{dataset:opts.dataset,table:'issuer_securities',naturalKey,reasonCode,detail,payload,batchId:opts.batchId},counts,errors,{code:reasonCode,key:naturalKey});
 for(const e of plan.figiErrors){
  counts.failed++;
  errors.push({code:'openfigi_error',key:e.isin,message:JSON.stringify({lei:e.lei,message:e.message,request_sha256:e.evidence.request_sha256,response_sha256:e.evidence.response_sha256,index:e.evidence.index})});
 }
 for(const a of plan.attaches){
  try{
   const res=await attachSecurity(tables,a);
   if(res==='inserted')counts.inserted++;
   else if(res==='duplicate')counts.duplicates++;
   else{
    const cause=await conflictCause(tables,a);
    await park(cause.reasonCode,`${a.ticker}:${a.valid_from}`,{...(plan.attachEvidence[`${a.issuer_id}|${a.ticker}`]??{}),rule:'same_lei',...cause.detail},
     {issuer_id:a.issuer_id,ticker:a.ticker,isin:a.isin??null,valid_from:a.valid_from});
   }
  }catch(e){counts.failed++;errors.push({code:errorMessage(e)==='issuer_not_active'?'issuer_not_active':'security_error',key:a.ticker,message:errorMessage(e)});}
 }
 for(const x of plan.conflicts)await park('ownership_conflict',x.naturalKey,x.detail,x.payload);
 for(const c of plan.claims){
  try{const created=await fileClaim(tables,c);const k=created?c.op:`${c.op}_appended`;claims[k]=(claims[k]??0)+1;}
  catch(e){counts.failed++;errors.push({code:'claim_error',key:`${c.issuer_id}:${c.value}`,message:errorMessage(e)});}
 }
 counts.fetched=counts.inserted+counts.duplicates+counts.quarantined+counts.failed;
 const skippedSummary:Record<string,number>={};
 for(const s of plan.skipped)skippedSummary[s]=(skippedSummary[s]??0)+1;
 const lead:BatchError[]=Object.keys(claims).length?[{code:'claims_summary',message:JSON.stringify(claims)}]:[];
 return {counts,errors:withSkippedSummary([...lead,...errors],skippedSummary),skippedSummary,rejectedSummary:{},claims};
}
/**
 * A+H linking (spec §4.2.2): rule 1 same LEI (GLEIF ISIN → OpenFIGI HK line → automatic attach at
 * the listing date), rule 2 HKEX list name match (attach_security claims only).
 *   npx tsx scripts/entity-keys/link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]
 * <dir> holds the HKEX files named in HKEX_LIST_FILES: ListOfSecurities.xlsx (names, categories) and the ISIN
 * workbooks (isinsehk.xls, isino.xls); an OpenFIGI HK ticker is attached automatically only when the HKEX ISIN of its stock code equals the
 * ISIN OpenFIGI mapped; every other hit becomes an attach_security claim (a ticker-level FIGI lookup is evidence only).
 * Dry run (default): no batch, nothing written (raw evidence hashed in memory); OpenFIGI is called.
 * --apply refuses while EXCH_MAP_VERIFIED is false (Task 3b) and records an ingest batch
 * (dataset entities.ah-link) and a freshness attempt.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; optional OPENFIGI_API_KEY.
 */
import {createReadStream,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createInterface} from 'node:readline';
import {selectAll,supabaseTableClient} from '../../src/lib/db/table-client';
import {emptyCounts,finishBatch,startBatch,type BatchError,type BatchStatus} from '../../src/lib/dq/batches';
import {DATASETS,DQ_DATASET_INVENTORY} from '../../src/lib/dq/datasets';
import {recordAttempt} from '../../src/lib/dq/freshness';
import {memoryRawStore,supabaseRawStore,type RawStore} from '../../src/lib/dq/raw-store';
import {filterGleifLines,subsetForLeis} from '../../src/lib/entities/identifiers/gleif';
import {HKEX_LIST_FILES,mergeHkexIsins,parseHkexList,type HkexFileId,type HkexListParse} from '../../src/lib/entities/identifiers/hkex-list';
import {NAMES_VERSION} from '../../src/lib/entities/identifiers/names';
import {EXCH_MAP_VERIFIED,EXCH_MAP_VERSION,OPENFIGI_VERSION,groupFigiResults,mapIsins,mapTickers} from '../../src/lib/entities/identifiers/openfigi';
import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,type TickerLookup,type UniverseListing} from '../../src/lib/entities/link-ah';
import {errorMessage,loaderOutcome} from '../../src/lib/entities/load-sec';
import {getAdminSupabase} from '../../src/lib/supabase/admin';

const DATASET=DATASETS.entities.ahLink;
const USAGE='usage: link-ah.ts --gleif <lei-isin.csv> --hkex <dir> [--apply]';
const cadenceOf=(dataset:string)=>{const e=DQ_DATASET_INVENTORY.find(x=>x.dataset===dataset);if(!e)throw new Error(`unregistered_dataset:${dataset}`);return e.cadence;};
const str=(v:unknown)=>typeof v==='string'&&v!==''?v:null;
function bad():never{console.error(USAGE);process.exit(2);}

async function main(){
 const argv=process.argv.slice(2);
 let gleifPath:string|null=null,hkexDir:string|null=null,apply=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply')apply=true;
  else if(argv[i]==='--gleif')gleifPath=argv[++i]??bad();
  else if(argv[i]==='--hkex')hkexDir=argv[++i]??bad();
  else bad();
 }
 if(!gleifPath||!existsSync(gleifPath)||!hkexDir||!existsSync(hkexDir))bad();
 if(apply&&!EXCH_MAP_VERIFIED){console.error('exch_map_unverified: run the Task 3b OpenFIGI live check first (verification.md)');process.exit(2);}
 const admin=getAdminSupabase();const tables=supabaseTableClient(admin);
 const asOf=new Date().toISOString().slice(0,10);
 const open=await selectAll(tables,'issuer_securities',{valid_to:null},'ticker');
 const openOwner=new Map(open.map(r=>[String(r.ticker),String(r.issuer_id)]));
 const issuers=selectAhIssuers((await selectAll(tables,'issuers',{status:'active'},'issuer_id')).map(r=>({
  issuer_id:String(r.issuer_id),lei:str(r.lei),usci:str(r.usci),names:[str(r.canonical_name_en),str(r.canonical_name_zh)].filter((n):n is string=>n!==null)})),
  open.map(o=>({issuer_id:String(o.issuer_id),ticker:String(o.ticker)})));
 const universe=new Map<string,UniverseListing>((await selectAll(tables,'stocks_universe',{market:'HK'},'ticker')).map(r=>[String(r.ticker),{list_date:str(r.list_date),source:str(r.source),source_updated_at:str(r.source_updated_at)}]));
 const leis=new Set(issuers.map(i=>i.lei).filter((l):l is string=>l!==null));
 const lines:string[]=[];
 for await(const l of filterGleifLines(createInterface({input:createReadStream(gleifPath),crlfDelay:Infinity}),leis))lines.push(l);
 const subset=subsetForLeis(lines,leis);
 const hkexParses:HkexListParse[]=[];const hkexBytes=new Map<HkexFileId,Uint8Array>();
 for(const f of HKEX_LIST_FILES){
  const p=join(hkexDir,f.file);
  if(!existsSync(p))continue;
  const b=new Uint8Array(readFileSync(p));
  hkexParses.push(parseHkexList(b,f.id));hkexBytes.set(f.id,b);
 }
 const listParse=hkexParses.find(p=>p.file==='list_of_securities')??null;
 const merged=hkexParses.length?mergeHkexIsins(hkexParses):null;
 const hkexIsins=merged?.hasIsinColumn?merged.byCode:null;

 const run=async(raw:RawStore,batchId:string|null)=>{
  const gleifRaw=await raw.put({kind:'gleif',bytes:new TextEncoder().encode(subset.csv),contentType:'text/csv',meta:{purpose:'ah-link',leis:subset.byLei.size}});
  const hkexRaw=new Map<HkexFileId,{sha256:string;path:string}>();
  for(const p of hkexParses){
   const f=HKEX_LIST_FILES.find(x=>x.id===p.file)!;
   const st=await raw.put({kind:'hkex',bytes:hkexBytes.get(p.file)!,contentType:f.contentType,meta:{file:f.file}});
   hkexRaw.set(p.file,{sha256:st.sha256,path:st.path});
  }
  const deps={fetch,raw,apiKey:process.env.OPENFIGI_API_KEY||null};
  const m=await mapIsins([...new Set([...subset.byLei.values()].flat())].sort(),deps);
  const figiHits=figiHitsFromResults(issuers,subset,m.byKey);
  // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
  const tickerLookup=new Map<string,TickerLookup>();
  let exhausted=m.exhausted,tickerFailures=0;
  if(unvalidated.length&&!exhausted){
   const t=await mapTickers(unvalidated,deps);
   exhausted=t.exhausted;tickerFailures=t.failures.length+t.unprocessed.length;
   for(const [tk,r] of t.byKey){
    if(r.status!=='ok')continue;
    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
    if(c&&c.groups.length===1)tickerLookup.set(tk,{figi:c.groups[0].figi,level:c.groups[0].level,evidence:r.evidence});
   }
  }
  const listRaw=hkexRaw.get('list_of_securities');
  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),
   hkex:listParse?{rows:listParse.rows,file:listParse.file,sha256:listParse.sha256}:null,
   raw:{gleif:{sha256:gleifRaw.sha256,path:gleifRaw.path},...(listRaw?{hkex:listRaw}:{})}});
  return {plan,exhausted,figiFailures:m.failures.length+m.unprocessed.length+tickerFailures,result:batchId?await applyAhLinks(tables,plan,{batchId,dataset:DATASET}):null};
 };
 if(!apply){
  const {plan,exhausted}=await run(memoryRawStore(),null);
  console.log(JSON.stringify({mode:'dry-run (no batch, nothing written; pass --apply)',candidates:issuers.length,quotaExhausted:exhausted,
   attaches:plan.attaches.map(a=>({issuer_id:a.issuer_id,ticker:a.ticker,share_class:a.share_class,valid_from:a.valid_from,method:a.valid_from_method})),
   conflicts:plan.conflicts.length,claims:plan.claims.map(c=>({issuer_id:c.issuer_id,ticker:c.value})),skipped:plan.skipped.length},null,1));
  return;
 }
 const {batchId}=await startBatch(tables,{producer:'link-ah',dataset:DATASET,toolVersions:{
  gleif_subset_sha256:subset.sha256,hkex_file_sha256s:JSON.stringify(Object.fromEntries(hkexParses.map(p=>[p.file,p.sha256]))),openfigi:OPENFIGI_VERSION,exch_map:EXCH_MAP_VERSION,names:NAMES_VERSION,as_of:asOf}});
 let counts=emptyCounts(),errors:BatchError[]=[],status:BatchStatus='failed';
 try{
  const {result,exhausted,figiFailures}=await run(supabaseRawStore(admin),batchId);
  if(result)({counts,errors}=result);
  if(figiFailures){counts.failed+=figiFailures;errors=[...errors,{code:'openfigi_unprocessed',message:`${figiFailures} OpenFIGI request failures or unprocessed ISINs`}];}
  if(exhausted)errors=[...errors,{code:'quota_exhausted',message:'OpenFIGI limit reached: remaining jobs skipped'}];
 }catch(e){errors=[...errors,{code:'exception',message:errorMessage(e)}];}
 finally{
  try{status=await finishBatch(tables,batchId,{counts,errors});}
  catch(e){console.error(`finishBatch failed: ${errorMessage(e)}`);status='failed';}
 }
 const outcome=loaderOutcome(status,counts);
 await recordAttempt(tables,DATASET,{ok:outcome.ok,cadence:cadenceOf(DATASET)});
 console.log(JSON.stringify({batchId,status,counts,errors:errors.slice(0,20)},null,1));
 process.exitCode=outcome.exitCode;
}
main().catch(e=>{console.error(errorMessage(e));process.exit(1);});

exec
/bin/zsh -lc 'cat ../../../AGENTS.md; git diff 388ba8d''^ 388ba8d -- src/lib/entities/link-ah.ts; cat src/lib/dq/quarantine.ts; rg -n '"'function fileClaim|sources|evidenceKey' src/lib/entities/claims.ts; find src scripts -name '*AGENTS*'; cat src/lib/entities/link-ah.ts | head -115" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
<claude-mem-context>
# Memory Context

# [OsbornAlpha] recent context, 2026-09-23 3:55pm GMT+8

No previous sessions found.
</claude-mem-context>git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-bRCkqzop' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-74SRGq2Y' (errno=Operation not permitted)
diff --git a/src/lib/entities/link-ah.ts b/src/lib/entities/link-ah.ts
index a8fd31b..4d8cbc6 100644
--- a/src/lib/entities/link-ah.ts
+++ b/src/lib/entities/link-ah.ts
@@ -116,10 +116,10 @@ const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
 type Kind='hard'|'disagree'|'soft';
 type Classified={skip:string}|{kind:Kind;hk:HkexIsin|null};
 /** Per-hit gate, in this order: superseded counter (rejected before any validation), non-equity, not in universe; then hard / disagree / soft. */
-function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
+function classifyHit(h:AhFigiHit,input:AhLinkInput,rowsByCode:ReadonlyMap<string,readonly HkexListRow[]>):Classified{
  const code=h.ticker.slice(0,5);
  const k=input.hkexIsins?.get(code)??null;
- const rows=input.hkex?.rows.filter(r=>r.stockCode===code)??[];
+ const rows=rowsByCode.get(code)??[];
  const live=rows.filter(r=>!SUPERSEDED.test((r.name??'').trim()));
  if((rows.length>0&&live.length===0)||(!k&&input.hkexSuperseded?.has(code)))return {skip:'superseded_counter'};
  if(live.length>0&&!live.some(r=>r.category?.trim().toLowerCase()===HKEX_EQUITY_CATEGORY))return {skip:'not_equity'};
@@ -131,38 +131,46 @@ function classifyHit(h:AhFigiHit,input:AhLinkInput):Classified{
 export function planAhLinks(input:AhLinkInput):AhLinkPlan{
  const plan:AhLinkPlan={attaches:[],attachEvidence:{},conflicts:[],claims:[],skipped:[],figiErrors:[...(input.figiErrors??[])]};
  const byId=new Map(input.issuers.map(i=>[i.issuer_id,i]));
+ // issuers with a CONFIRMED link (auto-attached or already holding the line): only they are skipped by rule 2
  const linked=new Set<string>();
+ const rowsByCode=new Map<string,HkexListRow[]>();
+ for(const r of input.hkex?.rows??[])rowsByCode.set(r.stockCode,[...(rowsByCode.get(r.stockCode)??[]),r]);
  // 1. classify every hit (order independent), 2. group per (issuer, ticker), 3. decide per group
  const groups=new Map<string,{issuer:AhIssuer;ticker:string;hits:{h:AhFigiHit;c:{kind:Kind;hk:HkexIsin|null}}[]}>();
  const hits=[...input.figiHits].sort((a,b)=>cmp(a.issuer_id,b.issuer_id)||cmp(a.ticker,b.ticker)||cmp(a.isin,b.isin)||a.index-b.index);
  for(const h of hits){
   const issuer=byId.get(h.issuer_id);
   if(!issuer)continue;
-  const c=classifyHit(h,input);
+  const c=classifyHit(h,input,rowsByCode);
   if('skip' in c){plan.skipped.push(c.skip);continue;}
   const k=`${h.issuer_id}|${h.ticker}`;
   const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
   g.hits.push({h,c});groups.set(k,g);
  }
+ const issuersByTicker=new Map<string,string[]>();
+ for(const g of groups.values())issuersByTicker.set(g.ticker,[...(issuersByTicker.get(g.ticker)??[]),g.issuer.issuer_id]);
  for(const k of [...groups.keys()].sort()){
   const {issuer:i,ticker,hits:gh}=groups.get(k)!;
   const u=input.universe.get(ticker)!;
   const owner=input.openOwner.get(ticker);
   if(owner===i.issuer_id||i.hTickers.includes(ticker)){plan.skipped.push('already_attached');linked.add(i.issuer_id);continue;}
+  const l=listing(u,input.asOf);   // before the owner check: the quarantine key is `${ticker}:${valid_from}` (stable across runs, like load-sec)
+  const rivals=(issuersByTicker.get(ticker)??[]).filter(x=>x!==i.issuer_id).sort();
   const first=gh[0].h;
   const g0=input.raw?.gleif,hk0=input.raw?.hkex;
   const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
    ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
   const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
-  if(owner!==undefined){
-   plan.conflicts.push({naturalKey:`${ticker}:${input.asOf}`,detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence},
-    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin}});
-   linked.add(i.issuer_id);continue;
+  if(owner!==undefined||rivals.length){
+   plan.conflicts.push({naturalKey:`${ticker}:${l.valid_from}`,detail:owner!==undefined
+    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence}
+    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:rivals,classified:kinds,evidence:rawEvidence},
+    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin,valid_from:l.valid_from}});
+   continue;
   }
   const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
   const hard=gh.filter(x=>x.c.kind==='hard');
   const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
-  const l=listing(u,input.asOf);
   const figiHit=gh.find(x=>x.h.figi);
   if(auto){
    const hk=hard[0].c.hk!;const h=hard[0].h;
@@ -180,7 +188,7 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
   const sources:ClaimEvidence[]=[];
   const add=(e:ClaimEvidence)=>{if(!sources.some(s=>s.source===e.source&&s.evidence_sha256===e.evidence_sha256&&s.locator===e.locator))sources.push(e);};
   for(const {h,c} of gh){
-   add({source:'gleif_openfigi',as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
+   add({source:`gleif_openfigi:${h.isin}`,as_of:input.asOf,evidence_sha256:h.gleifSha256,locator:`gleif:${h.lei},${h.isin};openfigi:${h.responseSha256}#${h.index}`,
     note:`OpenFIGI mapped ISIN ${h.isin} to ${ticker}${h.figi?` (FIGI ${h.figi}, ${h.level})`:' (no single FIGI group)'}${h.requestSha256?`; request ${h.requestSha256}`:''}`});
    if(c.hk)add({source:`hkex_${c.hk.file}`,as_of:input.asOf,evidence_sha256:c.hk.sha256,locator:`${c.hk.file}:row:${c.hk.row}`,
     note:c.kind==='disagree'?`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)} disagrees with GLEIF/OpenFIGI ISIN ${h.isin}`:`HKEX ISIN ${c.hk.isin} for stock code ${ticker.slice(0,5)}`});
@@ -196,7 +204,7 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'gleif_openfigi',...(isins.length===1&&!kinds.includes('disagree')?{isin:isins[0]}:{})},
    evidence,sources,...(Object.keys(l.prov).length?{provenance_written:sanitizeProvenance(l.prov)}:{}),
   }});
-  linked.add(i.issuer_id);
+  // an unconfirmed provider hint does not suppress rule 2
  }
  if(input.hkex){
   const hk=input.hkex;
@@ -222,6 +230,8 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    if(owner!==undefined){plan.skipped.push(owner===i.issuer_id?'already_attached':'name_match_owned');continue;}
    const l=listing(u,input.asOf);
    const evidence:ClaimEvidence={source:`hkex_${hk.file}`,as_of:input.asOf,evidence_sha256:hk.sha256,locator:`${hk.file}:row:${row.row}`,note:`HKEX name "${row.name}" equals an issuer name after ${NAMES_VERSION}`};
+   const existing=plan.claims.find(c=>c.issuer_id===i.issuer_id&&c.value===ticker&&c.op==='attach_security');
+   if(existing){existing.detail.sources.push(evidence);continue;}   // one claim per issuer+ticker: the name match is more evidence for the same hint
    plan.claims.push({issuer_id:i.issuer_id,id_type:'ticker',value:ticker,source:'hkex_list_name_match',op:'attach_security',detail:{
     schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:i.issuer_id},
     params:{ticker,share_class:shareClassFor(i),valid_from:l.valid_from,valid_from_method:l.valid_from_method,source:'hkex_list_name_match',...(row.isin?{isin:row.isin}:{})},
// Quarantine queue (spec §5.2 dq_quarantine). Rows that fail validation are parked here with
// the batch that produced them instead of landing in the target table. An OPEN item is unique
// per (dataset, table_name, natural_key, reason_code) so re-running a producer does not pile up
// duplicates; the partial unique index dq_quarantine_open_key_uniq enforces it, so two producers
// racing on the same key converge on one row. Resolution only transitions rows that are still open and reports the outcome, so
// an unknown id or another admin's earlier decision is never silently overwritten. Rows are
// written so the DB invariants hold: (status='open') = (resolved_at is null), and
// status='open' or resolved_by is not null.
import {randomUUID} from 'node:crypto';
import {TableError} from '../db/table-client';
import type {Row,TableClient} from '../db/table-client';

export type QuarantineStatus='open'|'resolved_accept'|'resolved_reject';
export type ResolveOutcome='resolved'|'not_found'|'already_resolved';
export interface QuarantineInput{
 dataset:string;table:string;naturalKey:string;reasonCode:string;
 detail?:Record<string,unknown>;payload?:Record<string,unknown>;batchId:string;
}

const TABLE='dq_quarantine';
const RESOLUTIONS:readonly QuarantineStatus[]=['resolved_accept','resolved_reject'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid=(v:unknown):v is string=>typeof v==='string'&&UUID.test(v);
export const MAX_LIST=1000;

/**
 * Parks a row in quarantine and returns its id; an existing OPEN item with the same key and reason
 * is reused. If a concurrent producer inserts the same open key between our read and insert, the
 * unique index rejects ours (23505) and the winner's id is returned instead.
 */
export async function quarantine(client:TableClient,input:QuarantineInput):Promise<string>{
 const key={dataset:input.dataset,table_name:input.table,natural_key:input.naturalKey,reason_code:input.reasonCode};
 const openRow=async()=>(await client.select(TABLE,{...key,status:'open'},{limit:1}))[0];
 const existing=await openRow();
 if(existing)return existing.id as string;
 const id=randomUUID();
 try{
  await client.insert(TABLE,{
   id,...key,detail:input.detail??{},payload:input.payload??{},batch_id:input.batchId,
   status:'open',resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
  });
 }catch(e){
  if(!(e instanceof TableError)||e.code!=='23505')throw e;
  const winner=await openRow();
  if(!winner)throw e; // the clash was not on the open key (or the winner was already resolved)
  return winner.id as string;
 }
 return id;
}

export async function resolveQuarantine(client:TableClient,id:string,input:{status:QuarantineStatus;resolvedBy:string}):Promise<ResolveOutcome>{
 if(!RESOLUTIONS.includes(input.status))throw new Error('invalid_status');
 if(!isUuid(id))throw new Error('invalid_id');
 if(!isUuid(input.resolvedBy))throw new Error('invalid_resolver');
 const [row]=await client.select(TABLE,{id},{limit:1});
 if(!row)return 'not_found';
 if(row.status!=='open')return 'already_resolved';
 // Matching on status='open' keeps a concurrent resolution from being overwritten; zero
 // rows means another resolver won after our read.
 const n=await client.update(TABLE,{id,status:'open'},{status:input.status,resolved_by:input.resolvedBy,resolved_at:new Date().toISOString()});
 return n===1?'resolved':'already_resolved';
}

/**
 * Newest open items first (created_at desc). Rows sharing a created_at have no defined relative
 * order: the TableClient supports a single orderBy column, so `id` cannot be added as a tiebreaker.
 * `limit` is an integer 1..MAX_LIST.
 */
export async function listOpenQuarantine(client:TableClient,dataset?:string,limit=100):Promise<Row[]>{
 if(!Number.isInteger(limit)||limit<1||limit>MAX_LIST)throw new Error('invalid_limit');
 const match:Row=dataset===undefined?{status:'open'}:{status:'open',dataset};
 return client.select(TABLE,match,{orderBy:'created_at',desc:true,limit});
}
7:// again only appends new evidence to detail.sources and never changes target or params.
74: if(!Array.isArray(detail.sources)||!detail.sources.every(validEvidence))return bad('sources');
142:export function buildClaimDetail(input:{evidence_kind:EvidenceKind;target:ClaimTarget;params?:Record<string,unknown>;evidence:ClaimEvidence;sources?:ClaimEvidence[];provenance_written?:Record<string,unknown>}):ClaimDetail{
143: return {schema:CLAIM_SCHEMA,evidence_kind:input.evidence_kind,target:input.target,params:input.params??{},evidence:input.evidence,sources:input.sources??[],
148: * Appends every evidence item of the incoming claim (detail.evidence plus each of detail.sources) to the
150: * 20261107090000, Task 1b; plan audit round 1, P3): it dedupes against the claim's evidence and sources
151: * and patches detail.sources only, so concurrent filers never lose each other's evidence and target /
156: for(const evidence of [detail.evidence,...(detail.sources??[])]){
163:/** detail.sources without repeats by (source, evidence_sha256), and without the primary evidence itself. */
166: return (detail.sources??[]).filter(e=>{const k=`${e.source}\u0000${e.evidence_sha256}`;if(seen.has(k))return false;seen.add(k);return true;});
172: * is appended to detail.sources and false is returned; a concurrent duplicate (23505 on the partial
179:export async function fileClaim(client:TableClient,c:ClaimInput):Promise<boolean>{
195:    op:c.op,target_key,detail:{...c.detail,sources:dedupeSources(c.detail)},resolved_by:null,resolved_at:null,created_at:new Date().toISOString(),
// src/lib/entities/link-ah.ts
// A+H linking (spec §4.2.2). Rule 1 (automatic, hard_identifier): an issuer's LEI → GLEIF ISINs →
// OpenFIGI HK line that is in stocks_universe and held by nobody → attachSecurity at the listing
// date (listing_date) or the run date (first_observed); held by another issuer → ownership_conflict.
// Rule 2 (claims only, name_match): an issuer holding A-share rows, no H row and a name, whose
// normalized name equals exactly one HKEX "Equity" row → attach_security claim. share_class 'H'
// only when the issuer holds .SH/.SZ rows or a USCI, else 'unknown'. Rule 3 (official A+H list)
// waits for a confirmed source (spec §14-1).
// OpenFIGI tickers are HINTS: one ISIN can map to several tickers (Tencent: 00700.HK, 80700.HK,
// TCTZF). Hits are classified first (superseded -OLD counters, non-equity, not in universe are
// dropped and summarised), then grouped per (issuer, ticker) and decided deterministically:
//   - automatic attach ONLY on hard identifiers: HKEX ISIN of the stock code == the hit's ISIN
//     (and no conflicting hit for that ticker);
//   - every other in-universe HK hit not held by the issuer (no HKEX ISIN, HKEX/GLEIF ISIN
//     disagreement, a second H line, ambiguous ISINs) becomes an attach_security claim
//     (provider_mapping) with all evidence, a ticker-level FIGI lookup being evidence only;
//   - a ticker open at another issuer is an ownership_conflict quarantine.
import type {TableClient} from '../db/table-client';
import {emptyCounts,type BatchError} from '../dq/batches';
import {fileClaim,type ClaimInput} from './claims';
import type {HkexFileId,HkexIsin,HkexListRow} from './identifiers/hkex-list';
import {NAMES_VERSION,normalizeCompanyName} from './identifiers/names';
import {groupFigiResults,type FigiEvidence,type FigiJob,type FigiJobResult} from './identifiers/openfigi';
import {rawPath} from '../dq/raw-store';
import {errorMessage,parkConflict,withSkippedSummary,type ApplyResult} from './load-sec';
import {sanitizeProvenance} from './provenance';
import {attachSecurity} from './securities';
import type {ClaimEvidence,IssuerSecurityInput,ValidFromMethod} from './types';

/** HKEX list Category value for ordinary equity, compared lower-cased and EXACTLY (live categories include "Equity Warrants…" and "Real Estate Investment Trusts"). */
export const HKEX_EQUITY_CATEGORY='equity';
export interface AhIssuer{issuer_id:string;lei:string|null;usci:string|null;names:string[];aTickers:string[];hTickers:string[]}
export interface AhFigiHit{issuer_id:string;ticker:string;isin:string;figi:string|null;level:'composite'|'venue'|null;job:FigiJob;gleifSha256:string;requestSha256?:string;responseSha256:string;index:number;lei:string}
export interface UniverseListing{list_date:string|null;source:string|null;source_updated_at:string|null}
/** A ticker-level OpenFIGI lookup: evidence only, never grounds for an automatic attach. */
export interface TickerLookup{figi:string;level:'composite'|'venue';evidence:FigiEvidence}
/** A per-job OpenFIGI `error` result (not `not_found`): the batch must fail with its evidence. */
export interface FigiJobError{isin:string;lei:string;message:string;evidence:FigiEvidence}
export interface AhLinkInput{
 asOf:string;issuers:readonly AhIssuer[];figiHits:readonly AhFigiHit[];
 universe:ReadonlyMap<string,UniverseListing>;
 /** ticker → issuer_id of its open row */
 openOwner:ReadonlyMap<string,string>;
 hkex:{rows:readonly HkexListRow[];file:HkexFileId;sha256:string}|null;
 /** 5-digit stock code → ISIN (mergeHkexIsins): the hard identifier for automatic attach */
 hkexIsins?:ReadonlyMap<string,HkexIsin>|null;
 /** 5-digit codes of superseded (-OLD) counters dropped by mergeHkexIsins */
 hkexSuperseded?:ReadonlySet<string>;
 tickerLookup?:ReadonlyMap<string,TickerLookup>;
 figiErrors?:readonly FigiJobError[];
 /** archived raw evidence (sha256 + bucket path) so quarantines can be replayed */
 raw?:{gleif?:{sha256:string;path:string};hkex?:{sha256:string;path:string}};
}
export interface AhLinkPlan{
 attaches:IssuerSecurityInput[];
 /** planned evidence per attach, keyed `${issuer_id}|${ticker}`: kept in the quarantine if the apply-time insert conflicts */
 attachEvidence:Record<string,Record<string,unknown>>;
 conflicts:{naturalKey:string;detail:Record<string,unknown>;payload:Record<string,unknown>}[];claims:ClaimInput[];skipped:string[];figiErrors:FigiJobError[];
}

const SUPERSEDED=/-\s*old$/i;
export const shareClassFor=(i:AhIssuer):'H'|'unknown'=>i.aTickers.length>0||!!i.usci?'H':'unknown';

/**
 * Issuers a run considers. Rule 1 needs only a LEI (share_class falls back to 'unknown'); rule 2
 * and the 'H' share class need A-share rows, which planAhLinks enforces itself.
 */
export function selectAhIssuers(issuers:readonly {issuer_id:string;lei:string|null;usci:string|null;names:string[]}[],openTickers:readonly {issuer_id:string;ticker:string}[]):AhIssuer[]{
 const by=new Map<string,string[]>();
 for(const t of openTickers)by.set(t.issuer_id,[...(by.get(t.issuer_id)??[]),t.ticker]);
 return issuers.map(i=>{
  const ts=by.get(i.issuer_id)??[];
  return {issuer_id:i.issuer_id,lei:i.lei,usci:i.usci,names:i.names,aTickers:ts.filter(t=>/^\d{6}\.(SH|SZ)$/.test(t)),hTickers:ts.filter(t=>/^\d{5}\.HK$/.test(t))};
 }).filter(i=>i.lei!==null||i.aTickers.length>0);
}

/** HK candidates of each issuer's LEI from stage-B style OpenFIGI results; figi only when exactly one group. */
export function figiHitsFromResults(issuers:readonly AhIssuer[],gleif:{sha256:string;byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):AhFigiHit[]{
 const out:AhFigiHit[]=[];
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='ok')continue;
   for(const c of groupFigiResults(r.records).candidates){
    if(c.market!=='HK')continue;
    const one=c.groups.length===1?c.groups[0]:null;
    out.push({issuer_id:i.issuer_id,ticker:c.ticker,isin,figi:one?.figi??null,level:one?.level??null,job:r.job,gleifSha256:gleif.sha256,requestSha256:r.evidence.request_sha256,responseSha256:r.evidence.response_sha256,index:r.evidence.index,lei:i.lei});
   }
  }
 }
 return out;
}

/** Per-job `error` results for the issuers' ISINs (`not_found` is a normal outcome and is not listed). */
export function figiErrorsFromResults(issuers:readonly AhIssuer[],gleif:{byLei:ReadonlyMap<string,readonly string[]>},results:ReadonlyMap<string,FigiJobResult>):FigiJobError[]{
 const out:FigiJobError[]=[];const seen=new Set<string>();
 for(const i of issuers){
  if(!i.lei)continue;
  for(const isin of gleif.byLei.get(i.lei)??[]){
   const r=results.get(isin);
   if(!r||r.status!=='error'||seen.has(isin))continue;
   seen.add(isin);out.push({isin,lei:i.lei,message:r.message.slice(0,200),evidence:r.evidence});
  }
 }
 return out.sort((a,b)=>a.isin<b.isin?-1:1);
}

function listing(u:UniverseListing,asOf:string):{valid_from:string;valid_from_method:ValidFromMethod;prov:Record<string,unknown>}{
 if(!u.list_date)return {valid_from:asOf,valid_from_method:'first_observed',prov:{}};
 return {valid_from:u.list_date,valid_from_method:'listing_date',prov:{valid_from:{source:'stocks_universe.list_date',provider:u.source,as_of:asOf,row:{list_date:u.list_date,source:u.source,source_updated_at:u.source_updated_at}}}};
}
const jobOf=(j:FigiJob)=>j.exchCode?{idType:j.idType,idValue:j.idValue,exchCode:j.exchCode}:{idType:j.idType,idValue:j.idValue};
const cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;


exec
/bin/zsh -lc "rg -n 'failures|status: .error|status:.error|byKey.set' src/lib/entities/identifiers/openfigi.ts; nl -ba src/lib/entities/link-ah.ts | sed -n '158,174p'; nl -ba scripts/entity-keys/link-ah.ts | sed -n '80,94p'; sed -n '280,390p' src/lib/entities/identifiers/openfigi.ts" in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 0ms:
35:export interface MapResult{results:(FigiJobResult|null)[];exhausted:boolean;requests:number;failures:FigiFailure[]}
36:export interface MappedBy{byKey:Map<string,FigiJobResult>;exhausted:boolean;unprocessed:string[];unsupported:string[];requests:number;failures:FigiFailure[]}
65: if(typeof o.error==='string')return {job,status:'error',message:o.error,evidence};
88: const failures:FigiFailure[]=[];
97: const done=(exhausted:boolean):MapResult=>({results,exhausted,requests,failures});
123:   failures.push({status:null,request_sha256:reqSha,response_sha256:null});return {res:null,bytes:null,sha:null};
129:   failures.push({status:res.status,request_sha256:reqSha,response_sha256:null,error:'body_read_failed'});return {res:null,bytes:null,sha:null};
132:  if(!res.ok)failures.push({status:res.status,request_sha256:reqSha,response_sha256:stored.sha256});
153:  if(!res.ok)throw new OpenFigiError('openfigi_http',String(res.status),failures[failures.length-1]);
164: keys.forEach((k,i)=>{const r=out.results[i];if(r)byKey.set(k,r);else unprocessed.push(k);});
165: return {byKey,exhausted:out.exhausted,unprocessed,unsupported,requests:out.requests,failures:out.failures};
   158	  const rivals=(issuersByTicker.get(ticker)??[]).filter(x=>x!==i.issuer_id).sort();
   159	  const first=gh[0].h;
   160	  const g0=input.raw?.gleif,hk0=input.raw?.hkex;
   161	  const rawEvidence={gleif_sha256:first.gleifSha256,...(g0?{gleif_path:g0.path}:{}),openfigi_response_sha256:first.responseSha256,openfigi_path:rawPath('openfigi',first.responseSha256,'json'),
   162	   ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
   163	  const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
   164	  if(owner!==undefined||rivals.length){
   165	   plan.conflicts.push({naturalKey:`${ticker}:${l.valid_from}`,detail:owner!==undefined
   166	    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence}
   167	    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:rivals,classified:kinds,evidence:rawEvidence},
   168	    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin,valid_from:l.valid_from}});
   169	   continue;
   170	  }
   171	  const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
   172	  const hard=gh.filter(x=>x.c.kind==='hard');
   173	  const auto=hard.length>0&&gh.every(x=>x.c.kind==='hard')&&isins.length===1&&i.hTickers.length===0;
   174	  const figiHit=gh.find(x=>x.h.figi);
    80	  // OpenFIGI tickers are hints: only an HKEX ISIN equal to the hit's ISIN attaches automatically; a ticker-level lookup is claim evidence for the rest
    81	  const unvalidated=[...new Set(figiHits.filter(h=>h.figi&&!hkexIsins?.has(h.ticker.slice(0,5))).map(h=>h.ticker))].sort();
    82	  const tickerLookup=new Map<string,TickerLookup>();
    83	  let exhausted=m.exhausted,tickerFailures=0;
    84	  if(unvalidated.length&&!exhausted){
    85	   const t=await mapTickers(unvalidated,deps);
    86	   exhausted=t.exhausted;tickerFailures=t.failures.length+t.unprocessed.length;
    87	   for(const [tk,r] of t.byKey){
    88	    if(r.status!=='ok')continue;
    89	    const c=groupFigiResults(r.records).candidates.find(x=>x.market==='HK'&&x.ticker===tk);
    90	    if(c&&c.groups.length===1)tickerLookup.set(tk,{figi:c.groups[0].figi,level:c.groups[0].level,evidence:r.evidence});
    91	   }
    92	  }
    93	  const listRaw=hkexRaw.get('list_of_securities');
    94	  const plan=planAhLinks({asOf,issuers,figiHits,universe,openOwner,hkexIsins,hkexSuperseded:new Set((merged?.dropped??[]).map(d=>d.stockCode)),tickerLookup,figiErrors:figiErrorsFromResults(issuers,subset,m.byKey),

codex
The contested-ticker handling prevents automatic attachment but loses evidence for all but the first contender when persisted. The added test does not detect this because quarantine counts include reused entries.

Review comment:

- [P2] Preserve every contender's evidence in contested-ticker quarantine — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:165-168
  When multiple issuers claim the same ticker, these conflicts all receive the same natural key and `ownership_conflict` reason. `quarantine()` reuses an existing open row without merging its payload or detail, so `applyAhLinks()` persists only the first issuer's evidence and silently discards the others, despite reporting each as quarantined. The new test checks counts but not persisted rows. Aggregate all contenders and their evidence into one quarantine entry, or distinguish their keys so every rejected mapping remains reviewable.
The contested-ticker handling prevents automatic attachment but loses evidence for all but the first contender when persisted. The added test does not detect this because quarantine counts include reused entries.

Review comment:

- [P2] Preserve every contender's evidence in contested-ticker quarantine — /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61/src/lib/entities/link-ah.ts:165-168
  When multiple issuers claim the same ticker, these conflicts all receive the same natural key and `ownership_conflict` reason. `quarantine()` reuses an existing open row without merging its payload or detail, so `applyAhLinks()` persists only the first issuer's evidence and silently discards the others, despite reporting each as quarantined. The new test checks counts but not persisted rows. Aggregate all contenders and their evidence into one quarantine entry, or distinguish their keys so every rejected mapping remains reviewable.

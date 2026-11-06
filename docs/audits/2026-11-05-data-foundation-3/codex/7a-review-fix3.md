OpenAI Codex v0.160.1
--------
workdir: /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
model: gpt-6-astra
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: none
session id: 01a1b043-4b74-7701-9530-a7a21ad3c1d6
--------
user
commit 4c9556f
exec
/bin/zsh -lc 'cat /Users/osborn/.agents/skills/code-review-and-quality/SKILL.md; git status --short; git show --stat --oneline 4c9556f; find .. -name AGENTS.md -o -name AGENTS.override.md' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 267ms:
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
git: error: couldn't create cache file '/tmp/xcrun_db-ZpTzsMoE' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-ldR4wTbG' (errno=Operation not permitted)
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-challenge.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix1.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix2.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review-fix3.md
?? docs/audits/2026-11-05-data-foundation-3/codex/7a-review.md
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3DNrcY75' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-3gjURFH6' (errno=Operation not permitted)
4c9556f fix(entities): link-ah aggregates all contenders of a contested ticker into one quarantine entry
 src/lib/entities/link-ah.test.ts | 12 +++++++++---
 src/lib/entities/link-ah.ts      | 22 ++++++++++++++++++----
 2 files changed, 27 insertions(+), 7 deletions(-)

exec
/bin/zsh -lc 'pwd; for p in /AGENTS.md /Volumes/AGENTS.md /Volumes/AIMATE_WORK/AGENTS.md /Volumes/AIMATE_WORK/Developer/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/AGENTS.md /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/AGENTS.md; do test ! -f "$p" || cat "$p"; done; ls -a; git show 4c9556f; cat src/lib/entities/link-ah.ts; cat src/lib/entities/link-ah.test.ts' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
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
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-OKnmUUVx' (errno=Operation not permitted)
git: warning: confstr() failed with code 5: couldn't get path of DARWIN_USER_TEMP_DIR; using /tmp instead
git: error: couldn't create cache file '/tmp/xcrun_db-DoX8oUlp' (errno=Operation not permitted)
commit 4c9556f9127071010cfeb5a9f15d704deabad20e
Author: gilosbornhello <osbornhello@gmail.com>
Date:   Fri Nov 6 01:49:12 2026 -0800

    fix(entities): link-ah aggregates all contenders of a contested ticker into one quarantine entry
    
    Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>

diff --git a/src/lib/entities/link-ah.test.ts b/src/lib/entities/link-ah.test.ts
index e66c0d2..08e40b4 100644
--- a/src/lib/entities/link-ah.test.ts
+++ b/src/lib/entities/link-ah.test.ts
@@ -129,11 +129,17 @@ describe('planAhLinks · review round 2',()=>{
  it('two issuers that would auto-attach the same ticker are both quarantined (no first-wins)',async()=>{
   const p=planAhLinks(input({issuers:[iss({}),iss({issuer_id:B,lei:'529900T8BM49AURSDO66'})],figiHits:[hit(),hit({issuer_id:B,lei:'529900T8BM49AURSDO66'})]}));
   expect(p.attaches).toEqual([]);
-  expect(p.conflicts.map(c=>[c.naturalKey,c.detail.reason,c.payload.issuer_id])).toEqual([['02338.HK:2004-03-11','ticker_claimed_by_several_issuers',A],['02338.HK:2004-03-11','ticker_claimed_by_several_issuers',B]]);
-  expect(p.conflicts[0].detail.competing_issuer_ids).toEqual([B]);
+  expect(p.conflicts).toHaveLength(1);
+  expect(p.conflicts[0]).toMatchObject({naturalKey:'02338.HK:2004-03-11',detail:{reason:'ticker_claimed_by_several_issuers',competing_issuer_ids:[A,B]},payload:{ticker:'02338.HK',issuer_ids:[A,B]}});
   const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
   const r=await applyAhLinks(c,p,{batchId:BATCH,dataset:DATASET});
-  expect(r.counts).toMatchObject({inserted:0,quarantined:2});
+  expect(r.counts).toMatchObject({inserted:0,quarantined:1});
+  const q=c.rows('dq_quarantine');
+  expect(q).toHaveLength(1);
+  const d=q[0].detail as {contenders:{issuer_id:string;isin:string;evidence:{gleif_sha256:string;openfigi_response_sha256:string}}[]};
+  expect(d.contenders.map(x=>x.issuer_id)).toEqual([A,B]);
+  expect(d.contenders.every(x=>x.isin==='CNE1000004L9'&&x.evidence.gleif_sha256==='a'.repeat(64)&&x.evidence.openfigi_response_sha256==='c'.repeat(64))).toBe(true);
+  expect(q[0].payload).toMatchObject({issuer_ids:[A,B]});
  });
 });
 
diff --git a/src/lib/entities/link-ah.ts b/src/lib/entities/link-ah.ts
index 4d8cbc6..dbe16b3 100644
--- a/src/lib/entities/link-ah.ts
+++ b/src/lib/entities/link-ah.ts
@@ -147,6 +147,8 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
   const g=groups.get(k)??{issuer,ticker:h.ticker,hits:[]};
   g.hits.push({h,c});groups.set(k,g);
  }
+ const contested=new Map<string,{ticker:string;valid_from:string;owner:string|undefined;contenders:{issuer_id:string;isin:string;isins:string[];classified:Kind[];evidence:Record<string,unknown>}[]}>();
+ const isins0=(gh:{h:AhFigiHit}[])=>[...new Set(gh.map(x=>x.h.isin))].sort();
  const issuersByTicker=new Map<string,string[]>();
  for(const g of groups.values())issuersByTicker.set(g.ticker,[...(issuersByTicker.get(g.ticker)??[]),g.issuer.issuer_id]);
  for(const k of [...groups.keys()].sort()){
@@ -162,10 +164,11 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
    ...(hk0?{hkex_sha256:hk0.sha256,hkex_path:hk0.path}:{})};
   const kinds=[...new Set(gh.map(x=>x.c.kind))].sort();
   if(owner!==undefined||rivals.length){
-   plan.conflicts.push({naturalKey:`${ticker}:${l.valid_from}`,detail:owner!==undefined
-    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:owner,classified:kinds,evidence:rawEvidence}
-    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:rivals,classified:kinds,evidence:rawEvidence},
-    payload:{issuer_id:i.issuer_id,ticker,isin:first.isin,valid_from:l.valid_from}});
+   // ONE quarantine entry per contested key: quarantine() reuses an open row without merging, so every contender is aggregated here
+   const key=`${ticker}:${l.valid_from}`;
+   const e=contested.get(key)??{ticker,valid_from:l.valid_from,owner,contenders:[]};
+   e.contenders.push({issuer_id:i.issuer_id,isin:first.isin,isins:isins0(gh),classified:kinds,evidence:rawEvidence});
+   contested.set(key,e);
    continue;
   }
   const isins=[...new Set(gh.map(x=>x.h.isin))].sort();
@@ -206,6 +209,17 @@ export function planAhLinks(input:AhLinkInput):AhLinkPlan{
   }});
   // an unconfirmed provider hint does not suppress rule 2
  }
+ for(const key of [...contested.keys()].sort()){
+  const e=contested.get(key)!;
+  e.contenders.sort((a,b)=>cmp(a.issuer_id,b.issuer_id));
+  const ids=e.contenders.map(c=>c.issuer_id);
+  const one=e.contenders.length===1?e.contenders[0]:null;
+  plan.conflicts.push({naturalKey:key,
+   detail:e.owner!==undefined
+    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:e.owner,...(one?{classified:one.classified,evidence:one.evidence}:{contenders:e.contenders})}
+    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:ids,contenders:e.contenders},
+   payload:one?{issuer_id:one.issuer_id,ticker:e.ticker,isin:one.isin,valid_from:e.valid_from}:{ticker:e.ticker,valid_from:e.valid_from,issuer_ids:ids,isins:[...new Set(e.contenders.flatMap(c=>c.isins))].sort()}});
+ }
  if(input.hkex){
   const hk=input.hkex;
   const byName=new Map<string,HkexListRow[]>();
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
 const contested=new Map<string,{ticker:string;valid_from:string;owner:string|undefined;contenders:{issuer_id:string;isin:string;isins:string[];classified:Kind[];evidence:Record<string,unknown>}[]}>();
 const isins0=(gh:{h:AhFigiHit}[])=>[...new Set(gh.map(x=>x.h.isin))].sort();
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
   // ONE quarantine entry per contested key: quarantine() reuses an open row without merging, so every contender is aggregated here
   const key=`${ticker}:${l.valid_from}`;
   const e=contested.get(key)??{ticker,valid_from:l.valid_from,owner,contenders:[]};
   e.contenders.push({issuer_id:i.issuer_id,isin:first.isin,isins:isins0(gh),classified:kinds,evidence:rawEvidence});
   contested.set(key,e);
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
 for(const key of [...contested.keys()].sort()){
  const e=contested.get(key)!;
  e.contenders.sort((a,b)=>cmp(a.issuer_id,b.issuer_id));
  const ids=e.contenders.map(c=>c.issuer_id);
  const one=e.contenders.length===1?e.contenders[0]:null;
  plan.conflicts.push({naturalKey:key,
   detail:e.owner!==undefined
    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:e.owner,...(one?{classified:one.classified,evidence:one.evidence}:{contenders:e.contenders})}
    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:ids,contenders:e.contenders},
   payload:one?{issuer_id:one.issuer_id,ticker:e.ticker,isin:one.isin,valid_from:e.valid_from}:{ticker:e.ticker,valid_from:e.valid_from,issuer_ids:ids,isins:[...new Set(e.contenders.flatMap(c=>c.isins))].sort()}});
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
// src/lib/entities/link-ah.test.ts
import {describe,it,expect} from 'vitest';
import {memoryTableClient} from '../db/memory-table-client';
import {TableError,type Row,type TableClient} from '../db/table-client';
import {memoryRawStore} from '../dq/raw-store';
import {loaderOutcome} from './load-sec';
import {mapIsins,type FigiJob,type FigiJobResult,type FigiRecord} from './identifiers/openfigi';
import {applyAhLinks,figiErrorsFromResults,figiHitsFromResults,planAhLinks,selectAhIssuers,shareClassFor,type AhFigiHit,type AhIssuer,type AhLinkInput} from './link-ah';

const ASOF='2026-11-05',BATCH='33333333-3333-4333-8333-333333333333',DATASET='entities.ah-link';
const A='10000000-0000-4000-8000-0000000000a1',B='10000000-0000-4000-8000-0000000000b1',C='10000000-0000-4000-8000-0000000000c1';
const LEI='529900T8BM49AURSDO55';
const iss=(o:Partial<AhIssuer>):AhIssuer=>({issuer_id:A,lei:LEI,usci:null,names:['Weichai Power Co., Ltd.','潍柴动力股份有限公司'],aTickers:['000338.SZ'],hTickers:[],...o});
const hit=(o:Partial<AhFigiHit>={}):AhFigiHit=>({issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:0,lei:LEI,...o});
const UNI=new Map([['02338.HK',{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}],['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
const HK_ISIN=(code:string,isin='CNE1000004L9')=>[code,{isin,file:'isin_hkex' as const,sha256:'e'.repeat(64),row:7}] as const;
const input=(o:Partial<AhLinkInput>={}):AhLinkInput=>({asOf:ASOF,issuers:[iss({})],figiHits:[hit()],universe:UNI,openOwner:new Map(),hkex:null,hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('02899')]),...o});

const hkexList=(rows:{stockCode:string;name:string;category:string}[])=>({file:'list_of_securities' as const,sha256:'d'.repeat(64),rows:rows.map((r,i)=>({...r,isin:null,row:i+5}))});
const RAWS={gleif:{sha256:'a'.repeat(64),path:`gleif/${'a'.repeat(64)}.csv`},hkex:{sha256:'d'.repeat(64),path:`hkex/${'d'.repeat(64)}.xlsx`}};
const U2=new Map([...UNI,['80700.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]]);
const strip=(p:ReturnType<typeof planAhLinks>)=>JSON.stringify(p);

describe('planAhLinks · rule 1 (same LEI, hard identifiers only)',()=>{
 it('auto-attaches only when the HKEX ISIN equals the hit ISIN; provenance.isin is the HKEX evidence, GLEIF/OpenFIGI corroborate',()=>{
  const p=planAhLinks(input());
  expect(p.attaches).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',share_class:'H',is_primary:false,valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi',provenance:{
   isin:{source:'hkex_isin_hkex',as_of:ASOF,evidence_sha256:'e'.repeat(64),locator:'isin_hkex:row:7',corroborated_by:[{source:'gleif_openfigi',evidence_sha256:'a'.repeat(64),locator:`gleif:${LEI},CNE1000004L9;openfigi:${'c'.repeat(64)}#0`}]},
   figi:{source:'openfigi',as_of:ASOF,evidence_sha256:'c'.repeat(64),job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},level:'composite'},
   valid_from:{source:'stocks_universe.list_date',provider:'tushare_hk_basic',as_of:ASOF,row:{list_date:'2004-03-11',source:'tushare_hk_basic',source_updated_at:'2026-11-01T00:00:00Z'}},
  }}]);
  expect(p.claims).toEqual([]);
 });
 it('falls back to first_observed without a list date; share class unknown without A rows or USCI',()=>{
  const p=planAhLinks(input({issuers:[iss({aTickers:[]})],figiHits:[hit({ticker:'02899.HK',figi:null,level:null})]}));
  expect(p.attaches[0]).toMatchObject({ticker:'02899.HK',valid_from:ASOF,valid_from_method:'first_observed',share_class:'unknown',figi:null});
  expect(Object.keys(p.attaches[0].provenance??{})).toEqual(['isin']);
  expect(shareClassFor(iss({aTickers:[],usci:'91370000163446410B'}))).toBe('H');
 });
 it('quarantines a line owned by another issuer with the full evidence, whatever the validation class',()=>{
  const e={gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,openfigi_response_sha256:'c'.repeat(64),openfigi_path:`openfigi/${'c'.repeat(64)}.json`,hkex_sha256:'d'.repeat(64),hkex_path:RAWS.hkex.path};
  const owned=planAhLinks(input({openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
  expect(owned.attaches).toEqual([]);
  expect(owned.conflicts).toEqual([{naturalKey:'02338.HK:2004-03-11',detail:{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:B,classified:['hard'],evidence:e},payload:{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',valid_from:'2004-03-11'}}]);
  const soft=planAhLinks(input({hkexIsins:new Map(),openOwner:new Map([['02338.HK',B]]),raw:RAWS}));
  expect([soft.claims,soft.attaches]).toEqual([[],[]]);
  expect(soft.conflicts[0].detail).toMatchObject({classified:['soft'],owner_issuer_id:B});
 });
 it('summarises not-in-universe and not-equity drops; an own existing line is already_attached',()=>{
  expect(planAhLinks(input({figiHits:[hit({ticker:'09999.HK'})],hkexIsins:new Map([HK_ISIN('09999')])})).skipped).toEqual(['ticker_not_in_universe']);
  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity Warrants'}])})).skipped.includes('not_equity')).toBe(true);
  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Real Estate Investment Trusts'}])})).attaches).toEqual([]);
  expect(planAhLinks(input({issuers:[iss({hTickers:['02338.HK']})]})).skipped).toEqual(['already_attached']);
 });
 it('files a provider_mapping attach_security claim for a hit without an HKEX ISIN, with ticker-lookup evidence; never auto-attaches',()=>{
  const tl={figi:'BBG000WEICH1',level:'composite' as const,evidence:{request_sha256:'f'.repeat(64),response_sha256:'9'.repeat(64),index:2}};
  const p=planAhLinks(input({hkexIsins:new Map(),tickerLookup:new Map([['02338.HK',tl]])}));
  expect(p.attaches).toEqual([]);
  expect(p.claims).toHaveLength(1);
  const c=p.claims[0];
  expect(c).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',op:'attach_security',source:'gleif_openfigi',detail:{evidence_kind:'provider_mapping',target:{issuer_id:A},
   params:{ticker:'02338.HK',isin:'CNE1000004L9',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'gleif_openfigi'}}});
  expect(c.detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','openfigi_ticker']);
  expect(c.detail.sources[0].note).toContain(`request ${'b'.repeat(64)}`);
  expect(c.detail.sources[0].note).toContain('FIGI BBG000WEICH1, composite');
  expect(c.detail.sources[1]).toMatchObject({evidence_sha256:'9'.repeat(64),locator:`openfigi:${'9'.repeat(64)}#2`});
  expect(c.detail.sources[1].note).toContain(`request ${'f'.repeat(64)}`);
  expect(c.detail.sources[1].note).toContain('matches ISIN-level FIGI BBG000WEICH1');
  expect(Object.keys(c.detail.provenance_written??{})).toEqual(['valid_from']);
 });
 it('files a claim (no isin param) when HKEX and GLEIF/OpenFIGI ISINs disagree, and when the issuer already holds an H line',()=>{
  const d=planAhLinks(input({hkexIsins:new Map([HK_ISIN('02338','HK0000000001')])}));
  expect(d.attaches).toEqual([]);
  expect(d.claims).toHaveLength(1);
  expect(d.claims[0].detail.params).not.toHaveProperty('isin');
  expect(d.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','hkex_isin_hkex']);
  expect(d.claims[0].detail.sources[1].note).toContain('disagrees');
  const second=planAhLinks(input({issuers:[iss({hTickers:['00001.HK']})]}));
  expect([second.attaches.length,second.claims.length]).toEqual([0,1]);
 });
 it('never links every ticker OpenFIGI returns for an ISIN (Tencent: 00700.HK, 80700.HK, TCTZF): only the HKEX-confirmed one attaches',()=>{
  const p=planAhLinks(input({universe:U2,figiHits:[hit(),hit({ticker:'80700.HK',figi:'BBG000WEICH3'})],hkexIsins:new Map([HK_ISIN('02338'),HK_ISIN('80700','HK0000000001')])}));
  expect(p.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
  expect(p.claims.map(c=>c.value)).toEqual(['80700.HK']);
 });
 it('rejects -OLD superseded counters before any validation: no attach, no claim, summarised',()=>{
  const old=hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H-OLD',category:'Equity'}]);
  const a=planAhLinks(input({hkex:old}));
  expect([a.attaches,a.claims,a.conflicts]).toEqual([[],[],[]]);
  expect(a.skipped.filter(x=>x==='superseded_counter')).toEqual(['superseded_counter']);
  // dropped from the ISIN workbooks only (no list rows): same outcome, even with no HKEX ISIN left for the code
  const b=planAhLinks(input({hkexIsins:new Map(),hkexSuperseded:new Set(['02338'])}));
  expect([b.attaches,b.claims,b.conflicts]).toEqual([[],[],[]]);
  expect(b.skipped).toEqual(['superseded_counter']);
  // also not quarantined when another issuer owns the old counter
  expect(planAhLinks(input({hkex:old,openOwner:new Map([['02338.HK',B]])})).conflicts).toEqual([]);
 });
 it('is independent of hit order and keeps ambiguity: an invalid hit before or after a valid one gives the same plan',()=>{
  const ok=hit();
  const old=hit({ticker:'02899.HK'});
  const list=hkexList([{stockCode:'02899',name:'OTHER CO LTD - H-OLD',category:'Equity'}]);
  const x=planAhLinks(input({figiHits:[old,ok],hkex:list}));
  const y=planAhLinks(input({figiHits:[ok,old],hkex:list}));
  expect(strip(x)).toBe(strip(y));
  expect(x.attaches.map(a=>a.ticker)).toEqual(['02338.HK']);
  // two ISINs for one ticker, only one confirmed by HKEX: ambiguous → one claim, no attach, no isin param, any order
  const other=hit({isin:'CNE1000004M7',index:1});
  const p1=planAhLinks(input({figiHits:[ok,other]}));
  const p2=planAhLinks(input({figiHits:[other,ok]}));
  expect(strip(p1)).toBe(strip(p2));
  expect(p1.attaches).toEqual([]);
  expect(p1.claims).toHaveLength(1);
  expect(p1.claims[0].detail.params).not.toHaveProperty('isin');
  expect(p1.claims[0].detail.sources.length).toBeGreaterThanOrEqual(3);
 });
});

describe('planAhLinks · review round 2',()=>{
 it('an unconfirmed provider hint does not suppress rule 2; a name match on the same ticker adds evidence to the one claim',()=>{
  const list=hkexList([{stockCode:'02899',name:'WEICHAI POWER CO LTD - H',category:'Equity'}]);
  const p=planAhLinks(input({hkexIsins:new Map(),hkex:list,universe:new Map([...UNI,['02899.HK',{list_date:null,source:'tushare_hk_basic',source_updated_at:null}]])}));
  expect(p.claims.map(c=>[c.value,c.source]).sort()).toEqual([['02338.HK','gleif_openfigi'],['02899.HK','hkex_list_name_match']]);
  const same=planAhLinks(input({hkexIsins:new Map(),hkex:hkexList([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'}])}));
  expect(same.claims).toHaveLength(1);
  expect(same.claims[0].detail.sources.map(x=>x.source)).toEqual(['gleif_openfigi:CNE1000004L9','hkex_list_of_securities']);
  // a CONFIRMED (auto-attached) link still suppresses rule 2
  expect(planAhLinks(input({hkex:hkexList([{stockCode:'02899',name:'WEICHAI POWER CO LTD - H',category:'Equity'}])})).claims).toEqual([]);
 });
 it('two issuers that would auto-attach the same ticker are both quarantined (no first-wins)',async()=>{
  const p=planAhLinks(input({issuers:[iss({}),iss({issuer_id:B,lei:'529900T8BM49AURSDO66'})],figiHits:[hit(),hit({issuer_id:B,lei:'529900T8BM49AURSDO66'})]}));
  expect(p.attaches).toEqual([]);
  expect(p.conflicts).toHaveLength(1);
  expect(p.conflicts[0]).toMatchObject({naturalKey:'02338.HK:2004-03-11',detail:{reason:'ticker_claimed_by_several_issuers',competing_issuer_ids:[A,B]},payload:{ticker:'02338.HK',issuer_ids:[A,B]}});
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const r=await applyAhLinks(c,p,{batchId:BATCH,dataset:DATASET});
  expect(r.counts).toMatchObject({inserted:0,quarantined:1});
  const q=c.rows('dq_quarantine');
  expect(q).toHaveLength(1);
  const d=q[0].detail as {contenders:{issuer_id:string;isin:string;evidence:{gleif_sha256:string;openfigi_response_sha256:string}}[]};
  expect(d.contenders.map(x=>x.issuer_id)).toEqual([A,B]);
  expect(d.contenders.every(x=>x.isin==='CNE1000004L9'&&x.evidence.gleif_sha256==='a'.repeat(64)&&x.evidence.openfigi_response_sha256==='c'.repeat(64))).toBe(true);
  expect(q[0].payload).toMatchObject({issuer_ids:[A,B]});
 });
});

describe('selectAhIssuers',()=>{
 it('keeps LEI-bearing issuers for rule 1 even without A rows or USCI; A-share restriction stays with rule 2 / share class',()=>{
  const rows=[
   {issuer_id:A,lei:LEI,usci:null,names:['X']},
   {issuer_id:B,lei:null,usci:'91370000163446410B',names:['Y']},
   {issuer_id:C,lei:null,usci:null,names:['Z']},
   {issuer_id:'10000000-0000-4000-8000-0000000000d1',lei:null,usci:null,names:['W']},
  ];
  const sel=selectAhIssuers(rows,[{issuer_id:C,ticker:'601899.SH'},{issuer_id:A,ticker:'AAPL'},{issuer_id:A,ticker:'02338.HK'}]);
  expect(sel.map(i=>i.issuer_id)).toEqual([A,C]);
  expect(sel[0]).toMatchObject({aTickers:[],hTickers:['02338.HK']});
  expect(shareClassFor(sel[0])).toBe('unknown');
  expect(shareClassFor(sel[1])).toBe('H');
  // an LEI issuer with no A rows still gets a rule-1 attach (share class unknown) and no rule-2 claim
  const p=planAhLinks(input({issuers:[{...sel[0],hTickers:[]}],hkex:hkexList([{stockCode:'02338',name:'X',category:'Equity'}])}));
  expect(p.attaches[0]).toMatchObject({issuer_id:A,share_class:'unknown'});
  expect(p.claims).toEqual([]);
 });
});

describe('planAhLinks · rule 2 (HKEX name match)',()=>{
 const hkex=hkexList;
 it('files one attach_security claim (name_match) for exactly one equal Equity name',()=>{
  const p=planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02339',name:'WEICHAI POWER CO LTD - H',category:'Debt Securities'}])}));
  expect(p.attaches).toEqual([]);
  expect(p.claims).toHaveLength(1);
  expect(p.claims[0]).toMatchObject({issuer_id:A,id_type:'ticker',value:'02338.HK',source:'hkex_list_name_match',op:'attach_security',detail:{
   schema:'claim/1',evidence_kind:'name_match',target:{issuer_id:A},
   params:{ticker:'02338.HK',share_class:'H',valid_from:'2004-03-11',valid_from_method:'listing_date',source:'hkex_list_name_match'},
   evidence:{source:'hkex_list_of_securities',as_of:ASOF,evidence_sha256:'d'.repeat(64),locator:'list_of_securities:row:5'},
  }});
 });
 it('files nothing for zero or several matches, for issuers without A rows, or when rule 1 already linked',()=>{
  const two=hkex([{stockCode:'02338',name:'WEICHAI POWER CO LTD - H',category:'Equity'},{stockCode:'02340',name:'Weichai Power Co Ltd',category:'Equity'}]);
  expect(planAhLinks(input({figiHits:[],hkex:two})).skipped).toEqual(['name_match_multiple']);
  expect(planAhLinks(input({figiHits:[],hkex:hkex([{stockCode:'00700',name:'TENCENT',category:'Equity'}])})).skipped).toEqual(['name_match_none']);
  expect(planAhLinks(input({figiHits:[],issuers:[iss({aTickers:[]})],hkex:two})).claims).toEqual([]);
  expect(planAhLinks(input({hkex:two})).claims).toEqual([]);
 });
});

describe('figiHitsFromResults',()=>{
 it('keeps HK candidates of each issuer LEI, with a FIGI only when exactly one group exists',()=>{
  const rec=(o:Partial<FigiRecord>):FigiRecord=>({figi:'BBG000WEICH1',compositeFIGI:'BBG000WEICH1',ticker:'2338',exchCode:'HK',securityType:'Common Stock',marketSector:'Equity',...o});
  const job:FigiJob={idType:'ID_ISIN',idValue:'CNE1000004L9'};
  const results=new Map<string,FigiJobResult>([['CNE1000004L9',{job,status:'ok',records:[rec({}),rec({ticker:'000338',exchCode:'CS',figi:'BBG000WEICH2',compositeFIGI:'BBG000WEICH2'})],evidence:{request_sha256:'b'.repeat(64),response_sha256:'c'.repeat(64),index:3}}]]);
  const hits=figiHitsFromResults([iss({})],{sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])},results);
  expect(hits).toEqual([{issuer_id:A,ticker:'02338.HK',isin:'CNE1000004L9',figi:'BBG000WEICH1',level:'composite',job,gleifSha256:'a'.repeat(64),requestSha256:'b'.repeat(64),responseSha256:'c'.repeat(64),index:3,lei:LEI}]);
 });

 it('lists per-job error results (not not_found) with their evidence; an HTTP-200 all-errors response fails the batch',async()=>{
  const fetch=(async()=>new Response(JSON.stringify([{error:'Invalid idValue format'}]),{status:200})) as typeof globalThis.fetch;
  const m=await mapIsins(['CNE1000004L9'],{fetch,raw:memoryRawStore(),sleep:async()=>{}});
  const gleif={sha256:'a'.repeat(64),byLei:new Map([[LEI,['CNE1000004L9']]])};
  expect(figiHitsFromResults([iss({})],gleif,m.byKey)).toEqual([]);
  const errs=figiErrorsFromResults([iss({})],gleif,m.byKey);
  expect(errs).toHaveLength(1);
  expect(errs[0]).toMatchObject({isin:'CNE1000004L9',lei:LEI,message:'Invalid idValue format',evidence:{index:0}});
  const nf=new Map<string,FigiJobResult>([['CNE1000004L9',{job:{idType:'ID_ISIN',idValue:'CNE1000004L9'},status:'not_found',message:'No identifier found.',evidence:errs[0].evidence}]]);
  expect(figiErrorsFromResults([iss({})],gleif,nf)).toEqual([]);
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const res=await applyAhLinks(c,planAhLinks(input({figiHits:[],figiErrors:errs})),{batchId:BATCH,dataset:DATASET});
  expect(res.counts.failed).toBe(1);
  expect(res.errors.find(e=>e.code==='openfigi_error')).toMatchObject({key:'CNE1000004L9'});
  expect(JSON.parse(res.errors.find(e=>e.code==='openfigi_error')!.message!)).toMatchObject({request_sha256:errs[0].evidence.request_sha256,response_sha256:errs[0].evidence.response_sha256,index:0});
  expect(loaderOutcome('partial',res.counts)).toEqual({ok:false,exitCode:1});
 });
});

describe('applyAhLinks',()=>{
 it('attaches, quarantines and files claims once; a replay is a duplicate',async()=>{
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  await c.insert('issuer_securities',{issuer_id:B,ticker:'02899.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
  const plan=planAhLinks(input({issuers:[iss({}),iss({issuer_id:C,lei:null,names:['Zijin Mining Group Co., Ltd.'],aTickers:['601899.SH']})],
   figiHits:[hit(),hit({issuer_id:A,ticker:'02899.HK'})],openOwner:new Map([['02899.HK',B]]),
   hkex:{file:'list_of_securities',sha256:'d'.repeat(64),rows:[{stockCode:'02899',name:'ZIJIN MINING GROUP CO LTD - H',category:'Equity',isin:null,row:9}]},raw:RAWS}));
  const res=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(c.rows('issuer_securities').find(r=>r.ticker==='02338.HK')).toMatchObject({issuer_id:A,share_class:'H',valid_from_method:'listing_date'});
  expect(c.rows('dq_quarantine').map(q=>[q.natural_key,q.reason_code])).toEqual([[`02899.HK:${ASOF}`,'ownership_conflict']]);
  expect(res.counts).toMatchObject({inserted:1,quarantined:1,failed:0});
  expect(res.claims).toEqual({});
  expect(res.skippedSummary).toEqual({name_match_owned:1});
  const again=await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  expect(again.counts).toMatchObject({inserted:0,duplicates:1});
 });

 it('keeps the planned evidence and names the real cause when attachSecurity conflicts at apply time',async()=>{
  const mk=()=>memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const row=(o:Record<string,unknown>)=>({issuer_id:B,ticker:'02338.HK',isin:null,figi:null,share_class:'unknown',is_primary:true,valid_from:'2020-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{},...o});
  const plan=planAhLinks(input({raw:RAWS}));
  // another issuer opened the ticker after planning
  const c1=mk();await c1.insert('issuer_securities',row({}));
  const r1=await applyAhLinks(c1,plan,{batchId:BATCH,dataset:DATASET});
  const q1=c1.rows('dq_quarantine')[0];
  expect(q1.reason_code).toBe('ownership_conflict');
  expect(q1.detail).toMatchObject({reason:'ticker_owned_by_other_issuer',owner_issuer_id:B,rule:'same_lei',validated_by:'hkex_isin',evidence:{gleif_sha256:'a'.repeat(64),gleif_path:RAWS.gleif.path,hkex_sha256:'d'.repeat(64)}});
  expect(r1.counts).toMatchObject({quarantined:1,inserted:0});
  // the issuer's own row already covers an overlapping window
  const c2=mk();await c2.insert('issuer_securities',row({issuer_id:A,valid_from:'2010-01-01'}));
  await applyAhLinks(c2,plan,{batchId:BATCH,dataset:DATASET});
  expect(c2.rows('dq_quarantine')[0].reason_code).toBe('window_conflict');
  expect(c2.rows('dq_quarantine')[0].detail).toMatchObject({reason:'window_overlaps_own_row',evidence:{gleif_sha256:'a'.repeat(64)}});
 });

 it('persists every grouped mapping through fileClaim dedupe, and a replay in a later run adds no quarantine row',async()=>{
  const c=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const hits=[hit(),hit({isin:'CNE1000004M7',index:1})];
  const plan=planAhLinks(input({figiHits:hits,hkexIsins:new Map()}));
  await applyAhLinks(c,plan,{batchId:BATCH,dataset:DATASET});
  const rows=c.rows('issuer_identifier_claims');
  expect(rows).toHaveLength(1);
  const d=rows[0].detail as {evidence:{source:string;locator?:string};sources:{source:string;locator?:string}[]};
  const srcs=[d.evidence,...d.sources];   // sources holds the non-primary items
  expect(srcs.map(x=>x.source).sort()).toEqual(['gleif_openfigi:CNE1000004L9','gleif_openfigi:CNE1000004M7']);
  expect(srcs.every(x=>x.locator)).toBe(true);
  // ownership conflict replayed with a different asOf: same stable key, one open row
  const q=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  const owned=(asOf:string)=>planAhLinks(input({asOf,openOwner:new Map([['02338.HK',B]])}));
  await applyAhLinks(q,owned('2026-11-05'),{batchId:BATCH,dataset:DATASET});
  await applyAhLinks(q,owned('2026-11-12'),{batchId:BATCH,dataset:DATASET});
  expect(q.rows('dq_quarantine').map(r=>r.natural_key)).toEqual(['02338.HK:2004-03-11']);
 });
 it('names an identifier conflict when the ISIN is already held by another ticker',async()=>{
  const mem=memoryTableClient({issuer_identifier_claims:['id'],dq_quarantine:['id']});
  await mem.insert('issuer_securities',{issuer_id:B,ticker:'600000.SH',isin:'CNE1000004L9',figi:null,share_class:'A',is_primary:true,valid_from:'2000-01-01',valid_to:null,valid_from_method:'first_observed',valid_to_method:null,source:'test',provenance:{}});
  // the real DB raises its ISIN unique index on insert; the memory client has no such index
  const c:TableClient={...mem,insert:async(t:string,row:Row)=>{if(t==='issuer_securities')throw new TableError('insert',t,'duplicate key value violates unique constraint "issuer_securities_isin_idx"','23505');return mem.insert(t,row);}};
  const r=await applyAhLinks(c,planAhLinks(input({raw:RAWS})),{batchId:BATCH,dataset:DATASET});
  const q=mem.rows('dq_quarantine');
  expect(q.map(x=>x.reason_code)).toEqual(['identifier_conflict']);
  expect(q[0].detail).toMatchObject({reason:'isin_held_by_other_row',isin:'CNE1000004L9',holders:[{issuer_id:B,ticker:'600000.SH'}],evidence:{gleif_sha256:'a'.repeat(64)}});
  expect(r.counts).toMatchObject({quarantined:1,failed:0});
 });
});

exec
/bin/zsh -lc "sed -n '209,350p' src/lib/entities/link-ah.ts; rg 'competing_issuer_ids|ticker_claimed_by_several_issuers|payload.issuer_id|detail.evidence' src/lib/dq scripts -n | head -60; find . -name 'AGENTS*' -not -path './node_modules/*'; for d in .claude .claude/worktrees; do for f in AGENTS.md AGENTS.override.md; do p=/Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/"'$d/$f; test ! -f "$p" || cat "$p"; done; done' in /Volumes/AIMATE_WORK/Developer/CodeX/OsbornAlpha/.claude/worktrees/data-foundation-3-18bc61
 succeeded in 63ms:
  }});
  // an unconfirmed provider hint does not suppress rule 2
 }
 for(const key of [...contested.keys()].sort()){
  const e=contested.get(key)!;
  e.contenders.sort((a,b)=>cmp(a.issuer_id,b.issuer_id));
  const ids=e.contenders.map(c=>c.issuer_id);
  const one=e.contenders.length===1?e.contenders[0]:null;
  plan.conflicts.push({naturalKey:key,
   detail:e.owner!==undefined
    ?{reason:'ticker_owned_by_other_issuer',rule:'same_lei',owner_issuer_id:e.owner,...(one?{classified:one.classified,evidence:one.evidence}:{contenders:e.contenders})}
    :{reason:'ticker_claimed_by_several_issuers',rule:'same_lei',competing_issuer_ids:ids,contenders:e.contenders},
   payload:one?{issuer_id:one.issuer_id,ticker:e.ticker,isin:one.isin,valid_from:e.valid_from}:{ticker:e.ticker,valid_from:e.valid_from,issuer_ids:ids,isins:[...new Set(e.contenders.flatMap(c=>c.isins))].sort()}});
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

codex
The change aggregates competing issuers into one quarantine entry per natural key while preserving existing single-contender ownership-conflict behavior. No actionable regressions were identified in the diff or its consumers; tests were not executed.
The change aggregates competing issuers into one quarantine entry per natural key while preserving existing single-contender ownership-conflict behavior. No actionable regressions were identified in the diff or its consumers; tests were not executed.
